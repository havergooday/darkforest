/* 게임은 단일 HTML 파일이므로, index.html 의 <script> 블록을 그대로 꺼내
   격리된 vm 컨텍스트에서 돌린다. 브라우저 API 의존은 document / localStorage
   뿐이라 최소 스텁으로 충분하다.

   미리 추출한 사본을 두지 않고 매번 index.html 을 읽는다. 그래야 테스트가
   항상 실제 배포되는 파일을 검증한다. */
const fs = require("fs"), vm = require("vm"), path = require("path");

const GAME = path.join(__dirname, "..", "index.html");

function source(){
  const html = fs.readFileSync(GAME, "utf8");
  const m = html.match(/<script>([\s\S]*)<\/script>/);
  if(!m) throw new Error("index.html 에서 <script> 블록을 찾지 못했다");
  return m[1];
}
const SRC = source();

function stubEl(){
  return { innerHTML:"", textContent:"", addEventListener(){}, classList:{toggle(){}} };
}

/* 매 호출마다 완전히 새 게임. 컨텍스트가 분리되므로 테스트 간 상태가 새지 않는다.
   반환값은 sandbox 자체이므로 top-level var(S, act, move, hydrate, CONFIG …)에
   그대로 접근할 수 있다. */
function newGame(){
  const els = {};
  const box = {
    document: {
      getElementById: id => els[id] || (els[id] = stubEl()),
      addEventListener(){},
      body: { classList:{ toggle(){} } }
    },
    localStorage: {
      m:{},
      getItem(k){ return k in this.m ? this.m[k] : null; },
      setItem(k,v){ this.m[k] = v; },
      removeItem(k){ delete this.m[k]; }
    },
    console: { log(){} },          // game.help() 등이 테스트 출력을 오염시키지 않게
    JSON, Math, Object, Array
  };
  box.window = box;
  vm.createContext(box);
  vm.runInContext(SRC, box);
  box._els = els;
  return box;
}

/* 렌더 결과 접근자 — render() 가 innerHTML 에 쓴 것을 그대로 읽는다 */
const acts    = g => g._els.acts.innerHTML;
const bagUI   = g => g._els.bag.innerHTML;
const legend  = g => g._els.legend.innerHTML;
const grid    = g => g._els.grid.innerHTML;
const clock   = g => g._els.clock.textContent;
const lastLog = g => g.game.s.log[g.game.s.log.length - 1].t;

/* 가방에 음수가 생겼는지 — 재료 검사 누락의 증상 */
const neg = bag => Object.keys(bag).filter(k => bag[k] < 0)
                         .map(k => k + "=" + bag[k]).join(",");

/* 거점(3,3) → 야영지(3,5). 2턴 소모 */
const toCamp = g => { g.move(3,4); g.move(3,5); };

module.exports = { newGame, source, acts, bagUI, legend, grid, clock, lastLog, neg, toCamp };
