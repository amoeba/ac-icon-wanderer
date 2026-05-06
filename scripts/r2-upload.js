import { readdir } from "fs/promises";
import { join, basename } from "path";
import { execSync } from "child_process";

const BUCKET = "ac-icon-wanderer-assets";
const dir = process.argv[2] || "public";

async function uploadDir(dir, prefix = "") {
  const files = await readdir(dir, { withFileTypes: true });
  for (const file of files) {
    const path = join(dir, file.name);
    if (file.isDirectory()) {
      await uploadDir(path, prefix ? `${prefix}/${file.name}` : file.name);
    } else {
      const key = prefix ? `${prefix}/${file.name}` : file.name;
      console.log(`Uploading ${key}...`);
      try {
        execSync(`wrangler r2 object put ${BUCKET}/${key} -f "${path}" --remote`, { stdio: "pipe" });
        console.log(`Uploaded ${key}`);
      } catch (e) {
        console.error(`Failed to upload ${key}: ${e.message}`);
      }
    }
  }
}

uploadDir(dir);