import { recorded, ResetStub, usingStub } from "../filesystem/vscode.stub";

import { expect } from "chai";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import {
  listDiskExtensionEntries,
  parseExtensionFolderName
} from "../../../src/service/extensionInventory.service";
import {
  ExtensionInformation,
  PluginService
} from "../../../src/service/plugin.service";

function makeApiExt(publisher: string, name: string) {
  return {
    id: `${publisher}.${name}`,
    packageJSON: {
      name,
      publisher,
      version: "1.0.0",
      isBuiltin: false,
      __metadata: {}
    }
  };
}

function makeDiskExt(folder: string, publisher: string, name: string) {
  const dir = path.join(folder, `${publisher}.${name}-2.0.0`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name, publisher, version: "2.0.0" })
  );
}

describe("Disabled Extensions Sync (#143)", function() {
  let folder: string;

  before(function() {
    if (!usingStub) {
      this.skip();
    }
  });

  beforeEach(() => {
    ResetStub();
    folder = fs.mkdtempSync(path.join(os.tmpdir(), "extinv-"));
    (vscode.extensions as any).all = [makeApiExt("pub-a", "enabled-ext")];
  });

  afterEach(() => {
    (vscode.extensions as any).all = [];
    fs.removeSync(folder);
  });

  it("parses on-disk <publisher>.<name>-<version> folders", () => {
    expect(parseExtensionFolderName("pub-a.my-ext-2.0.0")).to.deep.equal({
      publisher: "pub-a",
      name: "my-ext",
      version: "2.0.0"
    });
    expect(
      parseExtensionFolderName("dotted.pub.multi.part-1.2.3")
    ).to.deep.equal({
      publisher: "dotted",
      name: "pub.multi.part",
      version: "1.2.3"
    });
    expect(parseExtensionFolderName("no-version")).to.equal(null);
    expect(parseExtensionFolderName(".obsolete")).to.equal(null);
  });

  it("includes API-invisible disk extensions as disabled during upload inventory", () => {
    makeDiskExt(folder, "pub-a", "enabled-ext");
    makeDiskExt(folder, "pub-b", "disabled-ext");
    const list = PluginService.CreateExtensionListWithDisabled(folder);
    const disabled = list.find(e => e.name === "disabled-ext");
    const enabled = list.find(e => e.name === "enabled-ext");
    expect(disabled.disabled).to.equal(true);
    expect(enabled.disabled).to.equal(false);
  });

  it("ignores obsolete entries and builtins on disk", () => {
    makeDiskExt(folder, "pub-c", "gone-ext");
    fs.writeFileSync(
      path.join(folder, ".obsolete"),
      JSON.stringify({ "pub-c.gone-ext-2.0.0": true })
    );
    const builtin = path.join(folder, "pub-d.builtin-ext-1.0.0");
    fs.mkdirSync(builtin, { recursive: true });
    fs.writeFileSync(
      path.join(builtin, "package.json"),
      JSON.stringify({
        name: "builtin-ext",
        publisher: "pub-d",
        version: "1.0.0",
        isBuiltin: true
      })
    );
    const entries = listDiskExtensionEntries(folder);
    expect(entries.map(e => e.name)).to.not.include("gone-ext");
    expect(entries.map(e => e.name)).to.not.include("builtin-ext");
  });

  it("re-disables flagged extensions on download", async () => {
    const remote = ExtensionInformation.fromJSONList(
      JSON.stringify([
        {
          metadata: {},
          name: "off-ext",
          publisher: "pub-b",
          version: "2.0.0",
          disabled: true
        },
        {
          metadata: {},
          name: "on-ext",
          publisher: "pub-a",
          version: "1.0.0",
          disabled: false
        }
      ])
    );
    const result = await PluginService.DisableExtensions(remote);
    expect(result.disabled).to.deep.equal(["pub-b.off-ext"]);
    expect(recorded.commands).to.deep.equal([
      ["workbench.extensions.disableExtension", "pub-b.off-ext"]
    ]);
  });
});
