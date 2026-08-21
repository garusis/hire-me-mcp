import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Mechanical check (issue #65): no copy of the private voice/gap-discipline
 * reference material has landed in this public repo tree.
 *
 * The source files themselves — `~/.claude/career/voice.md` and
 * `~/.claude/career/gap-discipline.md` — live outside this repository and
 * are never read by this test (CI has no access to them at all, by design).
 * Instead, this file embeds a *hash* of every substantial line from those
 * two files, computed once while implementing this task. The check reads
 * every file in the repo tree, hashes each of its lines the same way, and
 * fails if any hash collides with one of the known private-source hashes.
 * That catches a literal copy-paste of any real line from either file
 * without ever committing the line's text itself.
 *
 * Lines under 40 characters are excluded from the known-hash set (and from
 * scanning) because short lines — headers, list markers, blank separators —
 * are not distinctive enough to identify a copy; hashing them would risk
 * false positives against unrelated prose that happens to share a short
 * line verbatim.
 */
const KNOWN_PRIVATE_LINE_HASHES = new Set<string>([
  "00370175e3aba887065efb06ad4019ad5b209073b2180cc315ab3113ba0134ce",
  "00a89939bef486698a1988ef52268f888fcbc27e86b834c23abdb631b484e2b6",
  "05c7149c75ea4a6b3afd3f432f84c59fc7ea3d621f87fc6299e1c3e1a92fd0f8",
  "072193d4582148545d324654d193d02a0bc18f24fefcd9c1a89fa2837f02ab34",
  "0759028455d568d1e06b9d673a32fe03c281f7eee3b6bd12cd431f8a4d1ef885",
  "0965b7ed35b285f260b1ea26b676ae38093fbcc9bc4512dde2ae7e5b5d263bcd",
  "0b86146bd2ac5b4797ed6e1e9567d1a350bc0056f3ed096a9bd020151ad38398",
  "103c1e057a34a9c61c7a0eb1fdfffe9532685fbf33caf400997522dae0540946",
  "109cc3cab0f07acb89f1f1830d623fb78076be43ed710d52f031071472b305d7",
  "10cac7856a9e9b34a39f49ad377ebdec82f5ad8079b0c8d5ded54defa66beec5",
  "12dd363774ef3f6f5cd26a56d90c70b6786947a492753839060cdde67b1b99d7",
  "1444ecbb7e1c08511a403033ae1e0deddfb32c9f5dc851e9977ac07666a04f6e",
  "169d051aaa3c032cb88acee25b8bee8709ed93356f56ce4afcd5454e176a62ea",
  "16c01e34f954ffb8e38bc9f9aac8103e40c9ce81ee8936ec64f3e5356c56a780",
  "17a296aaf7655bf623ef8068cf6fdefaad500303c5ef9e5db2ab0586fbe6e0bf",
  "17f5ffc3896de3fb7728c1c96866a5fa714b53b7d0d494fe5b37acb2833b8e97",
  "1938f5d231674e582cf1a2a73b24a79ea000978994d081b641e3ce3fd0ee062e",
  "1a340ce0ba15876e7c0d56718eae261fe2ab46fc7c15f335afc53625941ecbdb",
  "1aa9531e529c13b1297b98ec31ec0648eb616d62c33f74c85530718d2349358e",
  "1b0b2314c6c25dab25c6f6b3a81c35d74d6e691962bf40a8a6df082cf1414f89",
  "1b574a234788f47f5e3a09fa7e7029686ca6ee37817ed63366123679cc851928",
  "1c5caac0fd0822e88f41e8f18e868b4e82da9d02014604be1e3e7b3da5f7c4a5",
  "1e329e74ea9212d38cfb9b70f27250da07d19f0b21a6dbef2617e0bdc512e456",
  "2317857c2bf5934b2c5b4cd4c559b3f523716aea4add898d6788672239ad6c2d",
  "27c48cf349eb3e3b5716ab94d5ee5fd60bda315d72418531cab78e6a69cc32dc",
  "2bb77bc2404c325e0278bf834c70e6f5a9a98594e0d08680ebc77d55ac86504d",
  "2e002384a819028b14350da4f7c321dcd6b4f1912550cd057bbad83b94338a4c",
  "2ef2227f2775f2d1f7d87d828955ff673df123e9551a8febe707ac15ddc9ae57",
  "2f5d44590cbde6f241eaef4bdc4a6753f9c3e14de51eb93f0dc851ef268f11f2",
  "2f9545f641d66867ccff839205cacf73d21bbd887d8283222d0feb1d2c2597f8",
  "32c93a4bfa48e02545ecaa6908ec021e4699f7cf0a28bbd795eb602ab8e7bb97",
  "33a95b423753038c704e050eb78054b60320f8f50640d304f89ecc78526729a5",
  "33dd605683543958b857f0e8ada82174d0a446919fb52074149b8752dc5921a0",
  "341afef925925af24d53ca494cd4b1196c615393dde838c128da9eb7f37727bc",
  "3961e796c81bf83e6707c239fa9155f5e56235849fc2415e87b149d8c708665f",
  "397ccb97acb1eb534d63813d6e2486858dc37fc6fd5c48e26bf0ed2c16e8c969",
  "3c70f534268da6df296917456575a6f25b13ff300cff199a82f82d0317c0f048",
  "3d1d16c23a6a4d09eb5db814f7f60d67f9af1fe85b952d77e5d05d53eed46f17",
  "42534c8be446facc7a4d8fd292ebbab6af0c7a405574e14f14d5a8c56866be78",
  "436c80d7b7a6813b39b4bf2c63cc6f662421d9ffa546dbba96c1fa27f9f4c63d",
  "452e036cc5531bb5bb4872f490f9a74af3ee316c98e6d3cdafc17fae76948a8d",
  "453c04444070b9f06202dd620475a82d99fea4636ad2b00b2c53b84b42bc6226",
  "4599dee11e5424b22d73cc1b6e1a4f5e059312aed64035f15c0c7d61516d39e0",
  "47364236295c8ed862710214eb5046271bd8e29b422753f0d080a044cc2667f4",
  "478c44dca282d6aff27251c0fb560336db2ee594d9ce6f7d8bae00a60431c126",
  "478c48ac85999e2f9dc5bab7f2fe23f6e2e069474a69b42bf1c544e3f00a02c2",
  "4c84a1af402de012d9d0039cfa63967491f796e7b4fb8566838992837bc1e847",
  "4d041b35d0e0700fe635f5c6ab9e912cf8ab3d83f6929f86425d423ff7373c74",
  "4f3e1cb4a8a463671ec0d90d687095d3425064151cd924553bc3ab364f02ad9e",
  "54f10a4a8c11e1d141cd31ff25f3fcd1f2d163e1db7fd1315b1d01f9c2b9f1a8",
  "57bcab594e583e58c8aede55df3786d18378592e80e1d4be1477879bab1bbb14",
  "59e565f213849bc8d5b4c31e96a2f8861919ec93884affc8a9b2102f009e3b6a",
  "5bfeba7091a810d97e5685db1af0a08b88dc67226278ac8d12df45994422be48",
  "60ed660f3109ce0293eff15eb7ae5eeb9c97c4486b3ce2d47bbc6a03cf41079d",
  "61a2871fe57afa666b8d28f0d9d7cddd7bf515c3edf81524ba7ae71a80f9cdfb",
  "6417362c8d326671df2771597478afcccc93748b3634ca287853ace2e186d07e",
  "680cde6834c0f1a85b8aeb942a6c78d6543cee8e20a62ee3139cfa4c3849bc6a",
  "68a2eb4228bb1b5c241f3454b2c8514a855e0d637b7cb86765cdab8584fa8138",
  "6a246fc7ed6f33be73bdc550127c31086458bef878b6677ad5f9473ed84ebd1e",
  "6bb340f4a7a5a594a04c5d197e4a4c91ad68c14a4f03a52c35081b79c5c2fd30",
  "6cd53d195db6f4ad58902d1b341ed2469e93171473d469827495c7f3bab0d870",
  "6dac732bac3dc2e546e2d8b8b610bfe17d5a5484b433556804daac1b0b583bee",
  "6e93e106ec17d683b4dc180cc0bed4ec5079ab478444b646347cfcf976ae06eb",
  "6fab8a511cc9bd80209ff8ab9695b2929074f643343c32cec8d4d073fa718545",
  "71166a4aa7273b079b9853265223f9b80f75f428f8cf93f585ed620fd56bebf4",
  "72077e2ca9cc4617f4e44829e0cdb6738e7ce07c907c0c8b85ddf7c6e4c0bf2b",
  "721a58a1f66e6de912f3dbf258797ab8f9edc7b0e603d5a8c039d9bae22fba20",
  "768eaa2aacbb75485da069e8f22f5d0db06b7be6bf2d34b2bbc1d51dfa0be82d",
  "77018e98213659e4203b895f59c1708e818bb078e054bc94c3b68729729569c6",
  "78138f669d3edda0c014c2961e45e1be260280986dca66ac35d7e1f050f1992c",
  "7999b9fb9af761a5d00cfb4469a36d314c25682360af13961e7ae8cb639816d6",
  "8411f774e6672d0aa62ff48c091db1c95296f6d350692ac99c7813fa8a461c2a",
  "87161e8a51072f910d54ec42c33ad816f9aa07406fb41fac2d6c2ca5c2e43e04",
  "8743964777b224ddbe20d49a696710e20dec7b9c4b248ef3b6f7739ff6656754",
  "8a66a3b67033e0737c22b55184c8bbe5970b7ecdfc54128d569c7743c3091c2a",
  "904d93c9c12860f66087210160efd48c09f0dc42f4e29998dc9302a37afe2887",
  "972f23f083fc11eb56c23c34f18218f34e49a4eb2e5401fa68dc48ef1307ccfc",
  "9ad251984fec99be717d8b98645d66ae9118e0160d33531b4b7abf3c0ec0f77b",
  "9f1fa4da5ce178c617836ba8a8928aef4936c1884c41f137770a59ced9054a7e",
  "a02030d34340521186336b234dc985256237f474ba48292557bdfb2978c2c5ea",
  "b2c2a13d3f91bfeeb1fffac66b3a52a0d7177a1f33b8f76bdae5e86311434aef",
  "b42c55b6119abac4f01ecb887d00e574904f445099ac2e41cc3be40bc35a3210",
  "b46ce81495eaa790d0d4af4b61c0b17b6a320206b99cd22e88a01ebb0722d010",
  "baa72c6f2c22e631160477666ffeebc902e4ec585046660cee4839c3f2e49501",
  "c10acb0936f79c98be9ab9c1c6e7b731eeaadfb60df8e11de15d3b95373868d6",
  "c7853ac7e0f25c4a5d2b6037435accd6fd9a1d762944cc5471690bada7c96d9e",
  "c92ef137ccc2d9fb440c6c20b28bc420060a3ae4f8239098c0f0b1ab54e8ea10",
  "ca05500af2d6514d80187a32ec54dabe92f729ae84c11d499751d92cefad593b",
  "cb150711d33c38cbae34ff23f278c5904247ccffcac82f81d1f06c2d8d9e3322",
  "cbd7476bd54af1820cb659b65344209a51d7420619916e798a3b5c82bac41d5e",
  "cc133f6b68a202a1d23b8ee231c94da77f43603e1a5a6a72f9cf94b966b7116f",
  "ce646c19ee634baf47591addc6005014aebe792dd96c41d210f6aec7d94602f2",
  "d303a780e808e2652cb1c4114358963b0aa1a1d04780ed3c11f804a094da9cc0",
  "da1ca8b3580a62cb2e56fcfc91c4b2f840161c68c723e53a9de9375a8bf0b339",
  "ddd148c04ae544ca004d6bb670d167e5a1d7d0595be7b40eb2157c8c4cfd0b00",
  "e0297d7e0029128878d5ae2e9f2a97a7846c0e80d15207896cd3d599a7960a80",
  "e1271914a0422bf6b538af0191d54ec5142fc8ce62c37d630d081e73500696fc",
  "e2fb5a4e751038880458a73942167cd96bb322abba5b14c78780ba5d14fc460a",
  "e908526054489edf56aea6f634ccb96f18c239f1aca607cd6790b308de9840dd",
  "ead02fcb95def8d95987d38c31b7c7591cf1337a422432532dd60949702b5aa3",
  "eaec8fcb38267a3976d974fb579fe1f81bc6d3eba77e837ff73e568727f8d2ec",
  "eb316bb6e02b107bf3c52185f72ef614b7d1bc1cc181358b750498e329957784",
  "f10a75c2621613eb6371c1e73457d68b21469149b3c914f9584a6573f20889b5",
  "f19b891745c3563daeec5769ab789fc08b1e373d2f6ccf67b0826d8f624f1cf1",
  "f33aa5bcffd3db61534132a62bd04df8217f4eb91f55e0e5abeca7e21db9715d",
  "f5d287406c538edc026d962384eb768787babd8900a4ca04ea7fafce1ee92e2a",
  "f7f975165f8477561173149933bbe3417314cec6de35ad42daee5211996d4333",
  "fa73e547271d3169f2e7b142c57e022fdd401b6b593fcc219e9103cfbd7ffd80",
  "fd7d52fa6de76fff69d724f7df8485fd03afc283505a4ae38a033256eb9f8627",
]);

const MIN_LINE_LENGTH = 40;

/** Extensions unlikely to be meaningful text, skipped for both speed and correctness. */
const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".pdf",
  ".mp4",
  ".mov",
]);

// This test file itself embeds the hash allowlist above and would trivially
// "match itself" (a hash string is not a 40+ char prose line, but skip it
// anyway for clarity), and pnpm-lock.yaml is large, machine-generated, and
// never a plausible home for hand-written prose.
const EXCLUDED_PATHS = new Set(["pnpm-lock.yaml"]);

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

function isScannable(relPath: string): boolean {
  if (EXCLUDED_PATHS.has(relPath)) {
    return false;
  }
  const dotIndex = relPath.lastIndexOf(".");
  const extension = dotIndex === -1 ? "" : relPath.slice(dotIndex).toLowerCase();
  return !BINARY_EXTENSIONS.has(extension);
}

/** Every file git considers part of the tree: committed plus untracked-but-not-ignored. */
function listRepoFiles(): string[] {
  const output = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: REPO_ROOT,
    encoding: "utf-8",
  });
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(isScannable);
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex");
}

/** For every scannable repo file, every line whose hash matches a known private-source line. */
function findPrivateContentMatches(): string[] {
  const matches: string[] = [];
  for (const relPath of listRepoFiles()) {
    let content: string;
    try {
      content = readFileSync(join(REPO_ROOT, relPath), "utf-8");
    } catch {
      continue; // unreadable (e.g. a broken symlink) — not a text copy of anything
    }
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (line.length < MIN_LINE_LENGTH) {
        continue;
      }
      if (KNOWN_PRIVATE_LINE_HASHES.has(sha256(line))) {
        matches.push(relPath);
      }
    }
  }
  return matches;
}

describe("no private career-reference content in the repo tree", () => {
  it("contains no line matching a known line from voice.md or gap-discipline.md", () => {
    expect(findPrivateContentMatches()).toEqual([]);
  });

  it("contains no file literally named voice.md or gap-discipline.md", () => {
    const suspicious = listRepoFiles().filter(
      (relPath) => relPath.endsWith("/voice.md") || relPath.endsWith("/gap-discipline.md"),
    );
    expect(suspicious).toEqual([]);
  });

  it("has a non-empty known-hash allowlist (the check itself is not vacuously true)", () => {
    expect(KNOWN_PRIVATE_LINE_HASHES.size).toBeGreaterThan(0);
  });
});
