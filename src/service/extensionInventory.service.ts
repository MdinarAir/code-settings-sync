import * as fs from "fs";
import * as path from "path";

export interface IDiskExtensionEntry {
  publisher: string;
  name: string;
  version: string;
}

export function fullName(entry: { publisher: string; name: string }): string {
  return `${entry.publisher}.${entry.name}`;
}

export function parseExtensionFolderName(
  folderName: string
): IDiskExtensionEntry | null {
  const match = /^(.+)-(\d+\.\d+\.\d+.*)$/.exec(folderName);
  if (!match) {
    return null;
  }
  const head = match[1];
  const version = match[2];
  const dot = head.indexOf(".");
  if (dot <= 0 || dot === head.length - 1) {
    return null;
  }
  return {
    publisher: head.slice(0, dot),
    name: head.slice(dot + 1),
    version
  };
}

function readObsoleteMap(extensionFolder: string): { [key: string]: boolean } {
  try {
    const raw = fs.readFileSync(
      path.join(extensionFolder, ".obsolete"),
      "utf8"
    );
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as { [key: string]: boolean })
      : {};
  } catch (err) {
    return {};
  }
}

export function listDiskExtensionEntries(
  extensionFolder: string
): IDiskExtensionEntry[] {
  const entries: IDiskExtensionEntry[] = [];
  if (!extensionFolder) {
    return entries;
  }
  let obsolete: { [key: string]: boolean } = {};
  try {
    if (!fs.existsSync(extensionFolder)) {
      return entries;
    }
    obsolete = readObsoleteMap(extensionFolder);
    for (const folderName of fs.readdirSync(extensionFolder)) {
      if (obsolete[folderName]) {
        continue;
      }
      const parsed = parseExtensionFolderName(folderName);
      if (!parsed) {
        continue;
      }
      let packageJSON: any = null;
      try {
        packageJSON = JSON.parse(
          fs.readFileSync(
            path.join(extensionFolder, folderName, "package.json"),
            "utf8"
          )
        );
      } catch (err) {
        continue;
      }
      if (
        !packageJSON ||
        packageJSON.isBuiltin ||
        packageJSON.name !== parsed.name ||
        packageJSON.publisher !== parsed.publisher
      ) {
        continue;
      }
      if (!entries.some(e => fullName(e) === fullName(parsed))) {
        entries.push(parsed);
      }
    }
  } catch (err) {
    return entries;
  }
  return entries;
}
