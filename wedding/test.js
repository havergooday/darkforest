/* hack.html 흐름 검사:  node wedding/test.js
   실패가 있으면 종료 코드 1

   저장소의 test/harness.js 와 같은 방식이다 — hack.html 의 <script> 블록을 그대로
   꺼내 vm 컨텍스트에서 돌린다. 미리 추출한 사본을 두지 않으므로 항상 실제로
   배포되는 파일을 검증한다.

   브라우저 대신 최소 DOM 스텁을 쓰고, 시간은 가상 시계로 돌린다. 그래야
   "3초 안에 15번" 같은 것을 실제로 3초 기다리지 않고 검사할 수 있다. */
const fs = require("fs"), vm = require("vm"), path = require("path");

const PAGE = path.join(__dirname, "hack.html");
const SRC = (() => {
  const html = fs.readFileSync(PAGE, "utf8");
  const m = html.match(/<script>([\s\S]*)<\/script>/);
  if(!m) throw new Error("hack.html 에서 <script> 블록을 찾지 못했다");
  return m[1];
})();

/* ── 최소 DOM ────────────────────────────────────────────── */
const IDS = ["top","host","snd","skip","screen","bar","in",
             "gate","gmsg","gform","gin","ghint","gagain","gre","gskip","crt","vig"];

function makeDom(){
  const byId = {};

  class El {
    constructor(tag){
      this.tag = tag; this.children = []; this.parent = null;
      this.cls = new Set(); this._text = ""; this._html = "";
      this.dataset = {}; this.style = {}; this.subs = {};
      this.value = ""; this.placeholder = ""; this.disabled = false;
      this.clientWidth = 336; this.offsetWidth = 300;
      this.scrollTop = 0; this.scrollHeight = 0; this.clientHeight = 0;
    }
    set id(v){ this._id = v; byId[v] = this; }
    get id(){ return this._id; }
    set className(v){ this.cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
    get className(){ return [...this.cls].join(" "); }
    get classList(){
      const c = this.cls;
      return {
        add:(...n) => n.forEach(x => c.add(x)),
        remove:(...n) => n.forEach(x => c.delete(x)),
        contains:n => c.has(n),
        toggle:(n, on) => (on === undefined ? (c.has(n) ? c.delete(n) : c.add(n))
                                            : (on ? c.add(n) : c.delete(n)))
      };
    }
    /* innerHTML 로 심은 것도 진짜 자식이어야 한다 — 페이지가 그걸 다시
       querySelector 로 찾아 쓰기 때문이다 (유출 패널의 각 줄이 그렇다) */
    set innerHTML(v){ this._html = String(v); this.children = []; parseInto(this, this._html); }
    get innerHTML(){ return this._html; }
    set textContent(v){ this._text = String(v); }
    get textContent(){ return this._text; }
    appendChild(c){ c.parent = this; this.children.push(c); return c; }
    remove(){
      if(!this.parent) return;
      const i = this.parent.children.indexOf(this);
      if(i >= 0) this.parent.children.splice(i, 1);
      this.parent = null;
    }
    focus(){} blur(){}
    addEventListener(t, f, o){ (this.subs[t] = this.subs[t] || []).push({ f, o }); }
    removeEventListener(t, f){
      if(!this.subs[t]) return;
      this.subs[t] = this.subs[t].filter(s => s.f !== f);
    }
    fire(t, ev){
      ev = ev || {};
      ev.target = ev.target || this;
      ev.preventDefault = ev.preventDefault || (() => {});
      const subs = (this.subs[t] || []).slice();
      for(const s of subs){
        if(s.o && s.o.once) this.removeEventListener(t, s.f);
        s.f.call(this, ev);
      }
      /* 부모로 올라간다 — 화면 탭이 #screen 리스너에 닿아야 한다 */
      if(this.parent) this.parent.fire(t, ev);
    }
    closest(sel){
      let n = this;
      while(n){ if(match(n, sel)) return n; n = n.parent; }
      return null;
    }
    querySelector(sel){ return walk(this).find(e => match(e, sel)) || null; }
    querySelectorAll(sel){ return walk(this).filter(e => match(e, sel)); }
  }

  /* 아주 작은 HTML 파서. 페이지가 쓰는 만큼만 — 태그, class, 텍스트, <br> */
  function parseInto(host, html){
    const re = /<(\/?)([a-zA-Z0-9]+)([^>]*?)\/?>|([^<]+)/g;
    const stack = [host];
    let m;
    while((m = re.exec(html))){
      const top = stack[stack.length - 1];
      if(m[4] !== undefined){ top._text += m[4]; continue; }
      if(m[1] === "/"){ if(stack.length > 1) stack.pop(); continue; }
      const e = new El(m[2].toLowerCase());
      const cls = (m[3].match(/class="([^"]*)"/) || [])[1];
      if(cls) e.className = cls;
      const eid = (m[3].match(/\bid="([^"]*)"/) || [])[1];
      if(eid) e.id = eid;
      top.appendChild(e);
      if(!/^(br|img|input|hr)$/.test(e.tag)) stack.push(e);
    }
  }

  const walk = el => el.children.flatMap(c => [c, ...walk(c)]);
  function match(el, sel){
    return String(sel).split(",").map(s => s.trim()).some(s => {
      if(s[0] === "#") return el.id === s.slice(1);
      if(s[0] === ".") return el.cls.has(s.slice(1));
      const a = s.match(/^\[data-([\w-]+)="(.*)"\]$/);
      if(a) return el.dataset[a[1]] === a[2];
      return el.tag === s;
    });
  }

  const document = {
    createElement: t => new El(t),
    querySelector(sel){
      if(sel[0] === "#") return byId[sel.slice(1)] || null;
      return walk(document.body).find(e => match(e, sel)) || null;
    },
    addEventListener(){},
    body: new El("body")
  };
  /* 실제 문서의 중첩을 그대로 흉내 낸다. 평평하게 두면 게이트 안의 글자를
     게이트에서 읽을 수 없고, 탭 이벤트도 위로 올라가지 않는다 */
  const TREE = {
    top   : ["host", "snd", "skip"],
    screen: [],
    bar   : ["in"],
    gate  : ["gmsg", { gform: ["gin"] }, "ghint", { gagain: ["gre", "gskip"] }],
    crt   : [], vig: []
  };
  const mk = (id, kids) => {
    const e = new El("div"); e.id = id;
    (kids || []).forEach(k => {
      if(typeof k === "string") e.appendChild(mk(k, []));
      else Object.keys(k).forEach(n => e.appendChild(mk(n, k[n])));
    });
    return e;
  };
  Object.keys(TREE).forEach(id => document.body.appendChild(mk(id, TREE[id])));
  return { document, byId, El };
}

/* 눈에 보이는 글자만 긁어낸다. innerHTML 은 이미 자식으로 풀려 있다 */
function textOf(el){
  return (el._text + " " + el.children.map(textOf).join(" ")).replace(/\s+/g, " ").trim();
}

/* ── 가상 시계 ───────────────────────────────────────────── */
function makeClock(){
  let now = 0, tid = 1;
  let timers = [];
  const api = {
    setTimeout(fn, ms){ const id = tid++; timers.push({ id, at: now + (ms || 0), fn }); return id; },
    clearTimeout(id){ timers = timers.filter(t => t.id !== id); },
    raf(fn){ return api.setTimeout(() => fn(now), 16); },
    now: () => now,
    /* 타이머 큐가 잠깐 비었다고 끝난 것이 아니다. 아직 깨어나지 않은 약속이
       이어서 타이머를 걸 수 있으므로, 비었으면 한 번 배출하고 다시 본다 */
    async tick(ms){
      const end = now + ms;
      const flush = () => new Promise(r => setImmediate(r));
      const next = () => { timers.sort((a, b) => a.at - b.at); return timers[0]; };
      await flush();
      for(;;){
        let t = next();
        if(!t || t.at > end){
          await flush();
          t = next();
          if(!t || t.at > end) break;
        }
        timers.shift(); now = t.at; t.fn();
        await flush();
      }
      now = end;
      await flush();
    }
  };
  return api;
}

/* ── 페이지 한 판 ────────────────────────────────────────── */
function load(opt){
  opt = opt || {};
  const dom = makeDom(), clock = makeClock();
  const store = { m: opt.cleared ? { "wed.hack.cleared": "1" } : {} };

  const box = {
    document: dom.document,
    localStorage: {
      getItem: k => (k in store.m ? store.m[k] : null),
      setItem: (k, v) => { store.m[k] = String(v); },
      removeItem: k => { delete store.m[k]; }
    },
    location: { search: opt.search || "", pathname: "/wedding/hack.html", href: "" },
    matchMedia: () => ({ matches: !!opt.reduced }),
    requestAnimationFrame: clock.raf,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    performance: { now: clock.now },
    addEventListener(){}, scrollTo(){},
    visualViewport: null,
    URLSearchParams, Date, Math, JSON, Promise, String, Number, Object, Array,
    encodeURIComponent, isNaN, parseInt, parseFloat,
    console: { log(){}, warn(){}, error(){} }
  };
  box.window = box;
  vm.createContext(box);
  vm.runInContext(SRC, box);

  const el = id => dom.byId[id];
  const scr = () => textOf(el("screen"));
  const click = e => { if(e.onclick) e.onclick({ target: e, preventDefault(){} }); e.fire("click"); };
  const submit = (form, input, v) => { input.value = v; form.fire("submit"); };

  return { box, dom, clock, el, scr, click, submit, store,
           card: () => el("screen").querySelector(".box") };
}

/* ── 검사 ────────────────────────────────────────────────── */
const LINE = "━".repeat(52);
let pass = 0, fail = 0; const failed = [];
function ok(label, cond, extra){
  if(cond){ pass++; console.log("  PASS  " + label); }
  else { fail++; failed.push(label + (extra ? "  [" + extra + "]" : ""));
         console.log("  FAIL  " + label + (extra ? "  [" + extra + "]" : "")); }
}
function group(t){ console.log("\n" + t); }

/* 미션까지 밀어 준다 (연출은 즉시 완료 모드) */
async function toMission(g){
  g.el("gate").fire("click");
  await g.clock.tick(5000);
}

async function main(){
console.log("\n" + LINE + "\n  hack.html — 흐름 검사\n" + LINE);

/* 1. 로드 */
group("로드");
{
  let err = null;
  try{ load({ search: "?k=LOVE" }); }catch(e){ err = e; }
  ok("예외 없이 로드된다", !err, err && err.message);

  const g = load({ search: "" });
  ok("처음에는 게이트가 떠 있다", textOf(g.el("gate")).includes("화면을 누르십시오"));
  ok("입력줄은 숨어 있다", !g.el("bar").cls.has("on"));
}

/* 2. 액자 정렬 — 삐뚤어지는 것은 눈으로만 잡히는 종류다 */
group("아스키 액자");
{
  const g = load({ search: "?skip=1", reduced: true });
  await g.clock.tick(9000);
  const box = g.card();
  ok("건너뛰기 진입에서 액자가 그려진다", !!box);
  if(box){
    const edges = box.children.filter(c => c.cls.has("edge"));
    ok("위·아래 테두리가 둘 다 있다", edges.length === 2, "edges=" + edges.length);
    ok("테두리 길이가 같다", edges[0] && edges[1] && edges[0]._text.length === edges[1]._text.length,
       edges[0] && edges[0]._text.length + " vs " + (edges[1] && edges[1]._text.length));
    ok("테두리는 40칸 (모바일 폭 안)", edges[0] && edges[0]._text.length === 40,
       edges[0] && String(edges[0]._text.length));
    ok("테두리는 순수 ASCII 다", edges[0] && /^[+=]+$/.test(edges[0]._text));
    const rows = box.children.filter(c => c.cls.has("fr"));
    ok("액자 안쪽 줄이 있다", rows.length > 10, "rows=" + rows.length);
    ok("모든 줄이 좌우 막대를 가진다",
       rows.every(r => r.querySelectorAll(".b").length === 2));
  }
  const txt = g.scr();
  ok("신랑·신부 이름이 나온다", txt.includes("홍길동") && txt.includes("성춘향"));
  ok("예식 장소가 나온다", txt.includes("OO컨벤션"));
  ok("돌아가기 버튼이 있다", txt.includes("청첩장으로 돌아가기"));
  ok("클리어가 기록된다", g.store.m["wed.hack.cleared"] === "1");
}

/* 3. 하트 — 줄마다 폭이 다르면 통째로 어긋난다 */
group("하트 아스키");
{
  const g = load({ search: "?skip=1", reduced: true });
  await g.clock.tick(9000);
  const arts = g.card().querySelectorAll(".art").map(a => a._text);
  ok("하트가 8줄이다", arts.length === 8, "len=" + arts.length);
  const w = arts.map(a => a.length);
  ok("모든 줄의 폭이 같다", new Set(w).size === 1, w.join(","));
  ok("순수 ASCII 다", arts.every(a => /^[# ]+$/.test(a)));
}

/* 3-2. 두 사람이 걸어와 만나는 장면 — 액자와 같은 격자를 쓴다 */
group("걸어 다니는 두 사람");
{
  /* 애니메이션이 실제로 도는 경로 */
  const g = load({ search: "?skip=1", reduced: false });
  const scn = () => (g.card() ? g.card().querySelectorAll(".scn").map(s => s._text) : []);
  for(let i = 0; i < 80 && scn().length === 0; i++) await g.clock.tick(100);

  const early = scn();
  const lo = l => l.search(/\S/), hi = l => l.replace(/\s+$/, "").length - 1;
  ok("장면이 4줄이다", early.length === 4, "rows=" + early.length);
  ok("모든 줄이 38칸이다", early.every(l => l.length === 38),
     early.map(l => l.length).join(","));
  ok("처음에는 양 끝에 떨어져 있다", lo(early[2]) < 4 && hi(early[2]) > 33,
     JSON.stringify(early[2]));
  ok("아직 만나지 않았다", !early[2].includes("<3"));

  await g.clock.tick(6000);
  const met = scn();
  ok("만난 뒤에도 38칸을 지킨다", met.every(l => l.length === 38),
     met.map(l => l.length).join(","));
  ok("가운데에서 만난다", met[2].includes("<3"));
  ok("하트는 정확히 두 사람 사이다", met[2].indexOf("<3") === 18,
     "at=" + met[2].indexOf("<3"));
  ok("장면은 순수 ASCII 다", met.every(l => /^[\x20-\x7E]*$/.test(l)),
     JSON.stringify(met[1]));

  await g.clock.tick(20000);
  ok("만난 다음에야 하트가 피어난다", g.card().querySelectorAll(".art").length === 8);
  ok("하트 비가 내린다", !!g.dom.byId.rain || !!g.dom.document.querySelector("#rain"));
}
{
  /* 애니메이션을 끈 사람에게도 결과는 같아야 한다 */
  const g = load({ search: "?skip=1", reduced: true });
  await g.clock.tick(9000);
  const scn = g.card().querySelectorAll(".scn").map(s => s._text);
  ok("연출을 꺼도 만난 모습으로 그려진다", scn[2].includes("<3"));
  ok("연출을 꺼도 38칸이다", scn.every(l => l.length === 38));
  ok("연출을 끄면 하트 비는 내리지 않는다", !g.dom.document.querySelector("#rain"));
}

/* 4. 날짜 */
group("날짜 표기");
{
  const g = load({ search: "?skip=1", reduced: true });
  await g.clock.tick(9000);
  const t = g.scr();
  ok("2026-10-10 은 토요일로 나온다", t.includes("2026년 10월 10일 토요일"), t.slice(0, 80));
  ok("13:30 은 오후 1시 30분으로 나온다", t.includes("오후 1시 30분"));
}

/* 5. 게이트 */
group("게이트");
{
  const g = load({ search: "?k=LOVE", reduced: true });
  g.el("gate").fire("click");
  await g.clock.tick(1000);
  ok("URL 코드가 맞으면 입력 없이 시작한다", g.scr().includes("BREACH") || g.scr().includes("ssh"));

  const h = load({ search: "", reduced: true });
  h.el("gate").fire("click");
  await h.clock.tick(100);
  ok("코드가 없으면 입력창이 열린다", h.el("gform").cls.has("on"));
  await h.clock.tick(4000);
  ok("3초 뒤 힌트가 흐른다", textOf(h.el("ghint")).includes("힌트"));
  h.submit(h.el("gform"), h.el("gin"), "XXXX");
  await h.clock.tick(100);
  ok("틀리면 다시 묻는다", textOf(h.el("gmsg")).includes("코드가 다릅니다"));
  h.submit(h.el("gform"), h.el("gin"), "YYYY");
  h.submit(h.el("gform"), h.el("gin"), "ZZZZ");
  await h.clock.tick(2000);
  ok("3번째에는 그냥 들여보낸다", h.scr().includes("ssh") || h.scr().includes("BREACH"));

  const c = load({ search: "?k=LOVE", reduced: true, cleared: true });
  ok("재방문은 연출을 다시 틀지 않는다", textOf(c.el("gate")).includes("이미 한 번"));
  c.click(c.el("gskip"));
  await c.clock.tick(9000);
  ok("재방문에서 청첩장으로 바로 갈 수 있다", !!c.card());
}

/* 6. M1 — 여기서 막히면 그걸로 끝이다 */
group("AUTH 1 · 축하 메시지");
{
  for(const word of ["축하해요", "ㅊㅋㅊㅋ", "행복하세요", "축하", "congrats", "ㅋㅋㅋ"]){
    const g = load({ search: "?k=LOVE", reduced: true });
    await toMission(g);
    g.submit(g.el("bar"), g.el("in"), word);
    await g.clock.tick(1000);
    ok('"' + word + '" 통과', g.scr().includes("신랑·신부 이름 복구됨"));
  }
  const g = load({ search: "?k=LOVE", reduced: true });
  await toMission(g);
  ok("입력줄이 열린다", g.el("bar").cls.has("on"));
  g.submit(g.el("bar"), g.el("in"), "ㅁㄴㅇㄹ");
  await g.clock.tick(200);
  ok("엉뚱한 말은 한 번 튕긴다", g.scr().includes("그건 축하가 아닙니다"));
  g.submit(g.el("bar"), g.el("in"), "ㅁㄴㅇㄹ");
  await g.clock.tick(200);
  ok("두 번째엔 힌트를 준다", g.scr().includes("힌트"));
  g.submit(g.el("bar"), g.el("in"), "ㅁㄴㅇㄹ");
  await g.clock.tick(1000);
  ok("세 번째엔 무조건 통과시킨다", g.scr().includes("신랑·신부 이름 복구됨"));
  ok("통과하면 입력줄을 닫는다", !g.el("bar").cls.has("on"));
}

/* 7·8. M2 / M3 — 실패로 끝나는 경로가 없어야 한다 */
group("AUTH 2 · 실패해도 끝까지 간다");
{
  const g = load({ search: "?k=LOVE", reduced: true });
  await toMission(g);
  g.submit(g.el("bar"), g.el("in"), "축하해");
  await g.clock.tick(1000);

  const tap = g.el("screen").querySelector(".big");
  ok("연타 버튼이 있다", !!tap);
  ok("하트가 떠오를 자리가 있다", !!g.el("screen").querySelector(".sky"));
  g.click(tap);                              // 한 번만 두드리고 방치
  await g.clock.tick(4000);
  ok("시간이 지나도 넘어간다", g.scr().includes("마음은 전해졌습니다"));
  await g.clock.tick(2000);
  ok("일시·장소가 함께 복구된다", g.scr().includes("예식 일시·장소 복구됨"));
  await g.clock.tick(20000);
  ok("끝까지 가면 청첩장이 뜬다", !!g.card());
  ok("건너뛰기 버튼은 사라진다", g.el("skip").style.display === "none");
}
{
  const g = load({ search: "?k=LOVE", reduced: true });
  await toMission(g);
  g.submit(g.el("bar"), g.el("in"), "축하해");
  await g.clock.tick(1000);
  const tap = g.el("screen").querySelector(".big");
  const ecg = g.el("screen").querySelector(".ecg");
  for(let i = 0; i < 15; i++) g.click(tap);
  ok("두드릴수록 심박 파형이 자란다", ecg._text.length > 0 && ecg._text.length <= 30,
     "len=" + ecg._text.length);
  await g.clock.tick(300);                   // 미션 블록이 걷히기 전에 본다
  ok("15번 두드리면 성공 대사가 나온다", g.scr().includes("심박수 일치"));
  await g.clock.tick(2000);
  ok("성공해도 같은 자리로 이어진다", g.scr().includes("예식 일시·장소 복구됨"));
}

/* 9. 건너뛰기 — 지운 화면에 흐르던 연출이 끼어들면 안 된다 */
group("건너뛰기");
{
  const g = load({ search: "?k=LOVE", reduced: false });   // 일부러 느리게
  g.el("gate").fire("click");
  await g.clock.tick(1200);                                // 연출 도중
  ok("연출이 흐르는 중이다", g.scr().includes("ssh"));
  g.click(g.el("skip"));
  await g.clock.tick(12000);
  ok("청첩장이 뜬다", !!g.card());
  ok("지워진 연출이 다시 끼어들지 않는다", !g.scr().includes("ssh"), g.scr().slice(0, 90));
  ok("유출 패널도 남지 않는다", !g.scr().includes("BREACH"));
}

/* 10. 화면 탭 — 미션 중의 탭을 빨리감기로 먹으면 안 된다 */
group("화면 탭");
{
  const g = load({ search: "?k=LOVE", reduced: false });
  g.el("gate").fire("click");
  await g.clock.tick(600);
  ok("연출 중 화면을 누르면 빨리 감는다",
     (g.el("screen").fire("click"), g.box.hack.state().fast === true));

  const h = load({ search: "?k=LOVE", reduced: true });
  await toMission(h);
  ok("미션 중이라고 표시된다", h.box.hack.state().interactive === true);
  h.el("screen").querySelector(".mis").fire("click");
  ok("미션 중의 탭은 빨리감기로 먹지 않는다", h.box.hack.state().fast === false);
}

console.log("\n" + LINE);
if(fail){
  console.log("  실패 " + fail + " · 통과 " + pass + " · 총 " + (pass + fail) + "\n");
  failed.forEach(f => console.log("  ✗ " + f));
}else{
  console.log("  통과 " + pass + " / " + pass);
}
console.log(LINE);
  process.exit(fail ? 1 : 0);
}

module.exports = { load, textOf };
if(require.main === module) main();
