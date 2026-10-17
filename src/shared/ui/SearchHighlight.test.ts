import {describe,it,expect} from 'vitest';
import {searchTextParts,remarkSearchHighlight} from './SearchHighlight';
describe('literal search highlight',()=>{
 it('marks all literal occurrences without interpreting regex or markup',()=>{
  expect(searchTextParts('请填[a+b]，再核对[a+b]','[a+b]').filter(p=>p.match).map(p=>p.text)).toEqual(['[a+b]','[a+b]']);
  expect(searchTextParts('<script>同学</script>','<script>')[0]).toEqual({text:'<script>',match:true});
  expect(searchTextParts('AI 与 ai','ai').filter(p=>p.match)).toHaveLength(2);
 });
 it('keeps exact original text and clears marks for an empty query',()=>{
  const text='重要：评教评教。';expect(searchTextParts(text,'评教').map(p=>p.text).join('')).toBe(text);
  expect(searchTextParts(text,' ')).toEqual([{text,match:false}]);
 });
 it('only transforms visible prose nodes and leaves link destinations untouched',()=>{
  const tree={type:'root',children:[{type:'link',url:'https://example.test/评教',children:[{type:'text',value:'开始评教'}]},{type:'inlineCode',value:'评教'}]};
  remarkSearchHighlight({query:'评教'})(tree);expect(tree.children[0].url).toBe('https://example.test/评教');expect(tree.children[1].value).toBe('评教');expect(JSON.stringify(tree)).toContain('search-match');
 });
});
