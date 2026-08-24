/* 전체 테스트 실행:  node test/all.js
   실패가 있으면 종료 코드 1 */
const SUITES = [
  require("./bugfix.test.js"),
  require("./loot.test.js"),
  require("./keep.test.js")
];

const LINE = "━".repeat(52);
let pass = 0, fail = 0;
const failed = [];

for(const suite of SUITES){
  console.log("\n" + LINE + "\n  " + suite.name + "\n" + LINE);
  const t = {
    group(title){ console.log("\n" + title); },
    ok(label, cond, extra){
      const tail = extra ? "  [" + extra + "]" : "";
      if(cond){ pass++; console.log("  PASS  " + label); }
      else {
        fail++; failed.push(suite.name + " › " + label + tail);
        console.log("  FAIL  " + label + tail);
      }
    }
  };
  try { suite.run(t); }
  catch(e){
    fail++; failed.push(suite.name + " › 예외 " + e.message);
    console.log("  ERROR " + e.stack);
  }
}

console.log("\n" + LINE);
if(fail){
  console.log("  실패 " + fail + " · 통과 " + pass + " · 총 " + (pass + fail) + "\n");
  failed.forEach(f => console.log("  ✗ " + f));
} else {
  console.log("  통과 " + pass + " / " + pass);
}
console.log(LINE);
process.exit(fail ? 1 : 0);
