import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const checkpoint='b62f5e523877a8fa06d01b3a5d95e97de29a20cb';
assert.equal(execFileSync('git',['rev-parse','v0.1.0-submission^{commit}'],{encoding:'utf8'}).trim(),checkpoint,'Competition tag must not move.');
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
for(const file of files){
  assert.ok(!/^(?:data|artifacts|imports|node_modules|dist)\//.test(file),`Private/generated directory tracked: ${file}`);
  assert.ok(!/(?:^|\/)\.env(?:\.|$)/.test(file)||file==='.env.example',`Environment file tracked: ${file}`);
  if(/\.(?:ts|tsx|js|mjs|json|md|txt|yml|yaml)$/.test(file)){
    const text=readFileSync(file,'utf8');
    assert.ok(!/comfyui-[A-Za-z0-9_-]{24,}/.test(text),`Possible Comfy credential in ${file}`);
    assert.ok(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text),`Private key in ${file}`);
  }
}
assert.match(readFileSync('.gitignore','utf8'),/^\.env$/m);
console.log(`Release boundary verified: ${files.length} tracked files; immutable competition tag; no private workspace directories.`);
