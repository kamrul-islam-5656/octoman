/**
 * One-time migration: environments used to be workspace-global; they now belong to
 * exactly one collection (Environment.collection_id, required). This assigns every
 * pre-existing environment with no collection_id to its workspace's oldest collection
 * (creating a "Default Collection" if the workspace has none).
 *
 * Run once, before deploying the schema change that makes collection_id required:
 *   npx tsx scripts/migrate-environments-to-collections.ts
 */
import { readFileSync } from "fs";
import { Types } from "mongoose";
import { resolve } from "path";

function loadEnvFile() {
  const envPath = resolve(process.cwd(), ".env");
  let contents: string;
  try {
    contents = readFileSync(envPath, "utf-8");
  } catch {
    return;
  }

  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

async function main() {
  const { connectToDatabase } = await import("../src/lib/db/connect");
  const { CollectionModel } = await import("../src/lib/db/models/Collection");
  const { EnvironmentModel } = await import("../src/lib/db/models/Environment");
  const { UserModel } = await import("../src/lib/db/models/User");

  await connectToDatabase();

  const orphaned = await EnvironmentModel.find({
    $or: [{ collection_id: { $exists: false } }, { collection_id: null }],
  }).lean();

  if (orphaned.length === 0) {
    console.log("No orphaned environments found. Nothing to migrate.");
    return;
  }

  console.log(`Found ${orphaned.length} environment(s) with no collection_id.`);

  const workspaceIds = [...new Set(orphaned.map((env) => env.workspace_id))];
  const targetCollectionIdByWorkspaceId = new Map<string, Types.ObjectId>();

  for (const workspaceId of workspaceIds) {
    const envsInWorkspace = orphaned.filter((env) => env.workspace_id === workspaceId);
    const tenantId = envsInWorkspace[0].tenant_id;

    let targetCollection = await CollectionModel.findOne({ workspace_id: workspaceId })
      .sort({ createdAt: 1 })
      .select({ _id: 1 })
      .lean();

    if (!targetCollection) {
      const anyUser = await UserModel.findOne({ tenant_id: tenantId }).select({ _id: 1 }).lean();
      if (!anyUser) {
        console.warn(`Skipping workspace ${workspaceId}: no user found to attribute a new collection to.`);
        continue;
      }

      targetCollection = await CollectionModel.create({
        _id: new Types.ObjectId(),
        tenant_id: tenantId,
        workspace_id: workspaceId,
        name: "Default Collection",
        created_by: anyUser._id,
      });
      console.log(`Created "Default Collection" for workspace ${workspaceId}.`);
    }

    targetCollectionIdByWorkspaceId.set(workspaceId, targetCollection._id);
  }

  for (const env of orphaned) {
    const collectionId = targetCollectionIdByWorkspaceId.get(env.workspace_id);
    if (!collectionId) {
      console.warn(`Skipping environment "${env.name}" (${env._id}): no target collection for its workspace.`);
      continue;
    }
    await EnvironmentModel.updateOne({ _id: env._id }, { $set: { collection_id: collectionId.toString() } });
    console.log(`Assigned environment "${env.name}" (${env._id}) -> collection ${collectionId}.`);
  }

  console.log("Migration complete.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });
