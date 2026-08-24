const { newGame, acts, bagUI, legend, grid, lastLog, neg, toCamp }
  = require("./harness.js");

module.exports = {
  name: "소지품 가방",
  run(T){
    T.group("[소지품] 무게·한도와 완전히 무관");
    {
      const g=newGame(), S=g.game.s; toCamp(g); g.act("search");
      g.game.give("stone",20);                       // 짐을 한도까지 채운다
      T.ok("여유 0", g.room()===0, "room="+g.room());
      T.ok("일반 자원은 막힌다", (g.act("take:stick"), S.bag.stick===0));
      g.act("take:paper");
      T.ok("소지품은 가득 차도 들어온다", g.kept("paper")===true);
      T.ok("짐 무게가 늘지 않는다", g.carried()===20, "carried="+g.carried());
      T.ok("한도도 그대로", g.cap()===20);
      T.ok("bag에 섞이지 않는다", S.bag.paper===undefined);
      T.ok("keep에 카운트로 들어간다", S.keep.paper===1, JSON.stringify(S.keep));
    }

    T.group("[소지품] UI 표기");
    {
      const g=newGame(), S=g.game.s;
      T.ok("없을 때는 줄이 안 보인다", !bagUI(g).includes("소지품"));
      toCamp(g); g.act("search");
      T.ok("발견물 라벨", acts(g).includes("낡은 종이 뭉치를 챙긴다"), acts(g).slice(0,200));
      T.ok("소지품임을 알린다", acts(g).includes("소지품 · 지도 기록"));
      g.act("take:paper");
      T.ok("소지품 줄 등장", bagUI(g).includes('class="keep"') && bagUI(g).includes("낡은 종이 뭉치"), bagUI(g));
      T.ok("도구줄과 분리", !bagUI(g).includes("도구 · 낡은"));
      T.ok("획득 로그", lastLog(g).includes("낡은 종이 뭉치를 챙겼다"), lastLog(g));
    }

    T.group("[소지품] 효과는 소지만으로 발동");
    {
      const g=newGame(), S=g.game.s;
      T.ok("초기엔 기록 없음", legend(g).includes("기록 없음"));
      toCamp(g); g.act("search");
      T.ok("탐색만으로는 여전히 없음", legend(g).includes("기록 없음") && g.kept("paper")===false);
      g.act("take:paper");
      T.ok("소지 즉시 지도 기억 켜짐", legend(g).includes("기록 있음"));
      g.move(3,4); g.move(3,3);
      T.ok("떠난 칸이 기억에 남는다", g._els.grid.innerHTML.includes("cell vis mem"), "mem 클래스 없음");
    }

    T.group("[소지품] 확장 가능한 구조");
    {
      const g=newGame();
      T.ok("SPECIAL 레지스트리 존재", typeof g.SPECIAL==="object" && g.SPECIAL.paper);
      T.ok("LOOT_ORDER가 SPECIAL 우선", g.LOOT_ORDER[0]==="paper", JSON.stringify(g.LOOT_ORDER));
      T.ok("RES에서 종이 제거됨", g.RES.paper===undefined);
      // 런타임에 소지품을 추가해도 동작하는가
      g.SPECIAL.flint={n:"부싯돌", note:"소지품 · 점화", d:"불을 쉽게 붙인다"};
      g.LOOT_ORDER.unshift("flint");
      g.CONFIG.CAMP_LOOT.flint=1;
      toCamp(g); g.act("search");
      T.ok("새 소지품 버튼 노출", acts(g).includes('take:flint') && acts(g).includes("부싯돌을 챙긴다"), acts(g).slice(0,300));
      g.act("take:flint");
      T.ok("새 소지품 획득", g.kept("flint")===true && g.carried()===0, "carried="+g.carried());
      T.ok("소지품 줄에 둘 다", g._els.bag.innerHTML.includes("부싯돌"));
    }

    T.group("[소지품] 콘솔 API");
    {
      const g=newGame();
      g.game.keep();
      T.ok("game.keep() 전체 획득", g.kept("paper")===true);
      const g2=newGame(); g2.game.reveal();
      T.ok("game.reveal()도 종이를 준다", g2.kept("paper")===true && g2._els.legend.innerHTML.includes("기록 있음"));
    }

    T.group("[세이브] 구버전 paper 플래그 이관");
    {
      const g=newGame();
      const legacy={ r:3,c:3, hp:80, food:60, temp:70, paper:true,
                     bag:{stick:3,berry:1}, tools:{knife:true}, day:2, seen:{"3,3":true,"3,4":true} };
      const h=g.hydrate(legacy);
      T.ok("paper:true → keep.paper=1", h.keep.paper===1, JSON.stringify(h.keep));
      T.ok("낡은 플래그는 남기지 않는다", h.paper===undefined);
      T.ok("나머지 필드 정상", h.hp===80 && h.tools.knife===true && h.bag.stick===3);

      const noPaper=g.hydrate({paper:false, keep:{}});
      T.ok("paper:false는 이관 안 함", noPaper.keep.paper===undefined);

      const junk=g.hydrate({keep:{paper:"많이", laser:5, flint:-3}});
      T.ok("잘못된 소지품 값 무시", junk.keep.paper===undefined, JSON.stringify(junk.keep));
      T.ok("미지의 소지품 무시", junk.keep.laser===undefined && junk.keep.flint===undefined);

      // 신버전 왕복
      const g2=newGame(); toCamp(g2); g2.act("search"); g2.act("take:paper");
      const raw=g2.localStorage.getItem("forest.save.v1");
      T.ok("자동 저장에 keep 포함", JSON.parse(raw).keep.paper===1);
      const g3=newGame(); g3.localStorage.setItem("forest.save.v1", raw); g3.load();
      T.ok("복원 후 소지품 유지", g3.kept("paper")===true);
      T.ok("복원 후 지도 기억 유지", g3._els.legend.innerHTML.includes("기록 있음"));
    }

    T.group("[회귀] 앞선 수정이 모두 살아 있다");
    {
      const g=newGame(), S=g.game.s;
      S.fuel=20; g.act("bench1");
      T.ok("제작대 재료 검사", S.bench===0 && Object.keys(S.bag).every(k=>S.bag[k]>=0));
      const g2=newGame(); g2.act("light");
      T.ok("점화 재료 검사", g2.game.s.fuel===0);
      const g3=newGame(); const t=g3.game.s.turn; g3.act("stick");
      T.ok("빈 칸 채집 무턴", g3.game.s.turn===t);
      T.ok("좌표 클램프", g3.hydrate({r:99,c:-1}).r===6);
      // 발견물 부분 획득
      const g4=newGame(); toCamp(g4); g4.act("search"); g4.game.give("stone",18); g4.act("take:stick");
      T.ok("부분 획득 유지", g4.game.s.bag.stick===2 && g4.lootAt(3,5).stick===4);
      // 정상 플레이 완주
      const g5=newGame(), S5=g5.game.s;
      g5.move(3,2); g5.act("stick"); g5.move(3,3); g5.game.give("stick",5); g5.act("light");
      g5.game.give("stick",8); g5.game.give("stone",4); g5.act("bench1");
      g5.game.give("stone",3); g5.game.give("stick",2); g5.act("knife");
      T.ok("정상 진행 경로", S5.bench===1 && S5.tools.knife===true && S5.fuel>0);
      g5.game.all(); g5.game.tool(); g5.game.keep(); g5.game.skip(8);
      T.ok("콘솔 API 조합 정상", S5.bench===2 && g5.kept("paper")===true);
    }
  }
};
