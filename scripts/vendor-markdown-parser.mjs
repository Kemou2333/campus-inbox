import {createRequire} from 'node:module';
import {readFile,writeFile,realpath} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url);
const esbuild=require(require.resolve('esbuild',{paths:[dirname(require.resolve('vite'))]}));
const bundled=await esbuild.build({absWorkingDir:root,entryPoints:['scripts/vendor-markdown-parser-entry.mjs'],bundle:true,platform:'node',target:'node22',format:'esm',minify:true,legalComments:'inline',nodePaths:[join(root,'node_modules/.pnpm/node_modules')],metafile:true,write:false});
const packages=new Map();
for(const name of Object.keys(bundled.metafile.inputs)){
 if(!name.includes('node_modules/'))continue;
 let directory=dirname(await realpath(resolve(root,name)));
 for(;;){
  try{
   const metadata=JSON.parse(await readFile(join(directory,'package.json'),'utf8'));
   if(metadata.name){packages.set(`${metadata.name}@${metadata.version}`,{directory,metadata});break;}
  }catch{}
  const parent=dirname(directory);if(parent===directory)throw new Error(`Missing package metadata for ${name}`);directory=parent;
 }
}
const ordered=[...packages].sort(([a],[b])=>a.localeCompare(b)),licenses=[];
for(const [name,{directory,metadata}] of ordered){
 let license;
 for(const file of ['license','LICENSE','LICENSE.md','license.md']){try{license=await readFile(join(directory,file),'utf8');break;}catch{}}
 if(!license&&metadata.license==='MIT'&&String(metadata.repository).startsWith('https://github.com/micromark/micromark/')){
  const readme=await readFile(join(directory,'readme.md'),'utf8');
  if(readme.includes('[license]: https://github.com/micromark/micromark/blob/main/license'))license=await readFile(join(root,'node_modules/.pnpm/node_modules/micromark/license'),'utf8');
 }
 if(!license)throw new Error(`Missing license for ${name}`);
 licenses.push(`----- ${name} (${metadata.license}) -----\n${license.trim()}\n`);
}
const banner='// Generated from locked local Markdown dependencies. See MARKDOWN-PARSER-SOURCE.md.\n';
const code=banner+bundled.outputFiles[0].text,sha=createHash('sha256').update(code).digest('hex');
await writeFile(join(root,'server/vendor/markdown-parser.mjs'),code);
await writeFile(join(root,'server/vendor/MARKDOWN-PARSER-LICENSES'),licenses.join('\n'));
await writeFile(join(root,'server/vendor/MARKDOWN-PARSER-SOURCE.md'),`# Markdown 链接解析离线依赖\n\n项目锁文件已有依赖的本地 bundle，未下载或新增运行时 npm 包。解析器与 react-markdown 使用的 remark-parse / remark-gfm 相同：mdast-util-from-markdown 加 micromark-extension-gfm 与 gfmFromMarkdown。仅构建 Markdown AST 并提取链接，不执行 HTML、不取远程 URL。显式引用按首次定义解析，字符引用和反斜杠转义交给上游 CommonMark/GFM 解析器。\n\n- 构建入口：scripts/vendor-markdown-parser-entry.mjs\n- 生成：node scripts/vendor-markdown-parser.mjs（esbuild ${esbuild.version}，Node ESM，Node 22 目标）\n- 产物：markdown-parser.mjs，${Buffer.byteLength(code)} 字节\n- SHA-256：\`${sha}\`\n- 无外部运行时导入，不依赖服务器 node_modules。\n- 完整许可证与作者信息：MARKDOWN-PARSER-LICENSES\n- 上游：[remark-parse](https://github.com/remarkjs/remark/tree/main/packages/remark-parse)、[remark-gfm](https://github.com/remarkjs/remark-gfm)、[mdast-util-from-markdown](https://github.com/syntax-tree/mdast-util-from-markdown)。\n\n构建中实际使用的锁定包：\n\n${ordered.map(([name,{metadata}])=>`- ${name} (${metadata.license})`).join('\n')}\n\n升级前端 Markdown 依赖时须重新生成此 bundle，并运行实际 react-markdown 渲染 href 对照及整理/问答来源边界测试。\n`);
console.log(`Markdown parser: ${Buffer.byteLength(code)} bytes; ${packages.size} locked packages; SHA-256 ${sha}`);
