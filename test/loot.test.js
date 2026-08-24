const { newGame, acts, bagUI, legend, grid, lastLog, neg, toCamp }
  = require("./harness.js");

module.exports = {
  name: "야영지 발견물",
  run(T){
    T.group("[탐색] 지도상 야영지 위치 확인");
    { const g=newGame(); T.ok('(3,5)가 야영지', g.MAP[3][5]==="C", g.MAP[3][5]); }

    T.group("[탐색] 탐색 전에는 종이를 얻지 못한다");
    {
      const g=newGame(), S=g.game.s; toCamp(g);
      T.ok("야영지에 도착", S.r===3 && S.c===5);
      T.ok("탐색 버튼이 보인다", acts(g).includes('data-a="search"'));
      T.ok("아직 종이 없음", g.kept("paper")===false);
      T.ok("발견물이 아직 없다", g.lootAt(3,5)===undefined);

      const t0=S.turn; g.act("search");
      T.ok("탐색은 1턴", S.turn===t0+1, "turn "+t0+"->"+S.turn);
      T.ok("탐색만으로는 종이가 안 들어온다", g.kept("paper")===false);
      T.ok("발견물이 생겼다", JSON.stringify(g.lootAt(3,5))==='{"paper":1,"berry":4,"stick":6}', JSON.stringify(g.lootAt(3,5)));
      T.ok("탐색 버튼은 사라졌다", !acts(g).includes('data-a="search"'));
    }

    T.group("[획득] 종이 · 열매 · 나뭇가지를 골라 줍는다");
    {
      const g=newGame(), S=g.game.s; toCamp(g); g.act("search");
      const html=acts(g);
      T.ok("종이 버튼", html.includes('data-a="take:paper"'));
      T.ok("열매 버튼", html.includes('data-a="take:berry"'));
      T.ok("나뭇가지 버튼", html.includes('data-a="take:stick"'));
      T.ok("없는 자원 버튼은 없다", !html.includes('data-a="take:stone"') && !html.includes('data-a="take:vine"'));
      T.ok("종이가 맨 위", html.indexOf('take:paper') < html.indexOf('take:berry'));

      const t0=S.turn;
      g.act("take:berry");
      T.ok("열매 4개 획득", S.bag.berry===4, "berry="+S.bag.berry);
      T.ok("줍기는 턴을 쓰지 않는다", S.turn===t0, "turn "+t0+"->"+S.turn);
      T.ok("열매 버튼이 사라졌다", !acts(g).includes('data-a="take:berry"'));
      T.ok("나뭇가지는 아직 남았다", acts(g).includes('data-a="take:stick"'));

      g.act("take:paper");
      T.ok("종이 획득 = 지도 기록 켜짐", g.kept("paper")===true);
      T.ok("종이는 짐이 아니다", S.bag.paper===undefined && g.carried()===4, "carried="+g.carried());

      g.act("take:stick");
      T.ok("나뭇가지 6개 획득", S.bag.stick===6);
      T.ok("발견물 소진", g.lootLeft(g.lootAt(3,5))===0);
      T.ok("소진 안내가 뜬다", acts(g).includes("다 뒤졌다"), acts(g).slice(0,120));
      T.ok("지도에서 흐려진다", g._els.grid.innerHTML.includes('aria-label="야영지"'));
    }

    T.group("[획득] 소지 한도에 걸리면 부분 획득 후 남는다");
    {
      const g=newGame(), S=g.game.s; toCamp(g); g.act("search");
      g.game.give("stone",18);                 // 한도 20 중 18 사용
      T.ok("여유 2", g.room()===2, "room="+g.room());
      g.act("take:stick");                     // 6개 중 2개만
      T.ok("들 수 있는 만큼만 챙긴다", S.bag.stick===2, "stick="+S.bag.stick);
      T.ok("나머지는 야영지에 남는다", g.lootAt(3,5).stick===4, "left="+g.lootAt(3,5).stick);
      T.ok("한도를 넘지 않는다", g.carried()===20, "carried="+g.carried());
      T.ok("버튼이 남아 있다", acts(g).includes('data-a="take:stick"'));

      g.act("take:berry");                     // 이제 여유 0
      T.ok("가득 차면 못 줍는다", S.bag.berry===0, "berry="+S.bag.berry);
      T.ok("열매도 그대로 남는다", g.lootAt(3,5).berry===4);
      T.ok("한도 초과 안내", lastLog(g).includes("들 수 없다"), lastLog(g));

      // 종이는 무게가 없으므로 가득 찬 상태에서도 챙긴다
      g.act("take:paper");
      T.ok("종이는 가득 차도 챙길 수 있다", g.kept("paper")===true);
    }

    T.group("[지속] 떠났다 돌아와도 남은 발견물이 유지된다");
    {
      const g=newGame(), S=g.game.s; toCamp(g); g.act("search"); g.act("take:paper");
      g.move(3,4); g.move(3,3);
      T.ok("거점 복귀", g.atBase());
      T.ok("발견물이 보존됨", g.lootAt(3,5).stick===6 && g.lootAt(3,5).paper===0);
      toCamp(g);
      T.ok("재방문 시 탐색 버튼 안 뜬다", !acts(g).includes('data-a="search"'));
      T.ok("남은 것만 보인다", acts(g).includes('take:stick') && !acts(g).includes('take:paper'));
    }

    T.group("[세이브] 발견물 상태가 왕복한다");
    {
      const g=newGame(); toCamp(g); g.act("search"); g.act("take:berry");
      const raw=g.localStorage.getItem("forest.save.v1");
      T.ok("자동 저장에 loot 포함", raw && JSON.parse(raw).loot["3,5"].stick===6);
      const g2=newGame();
      g2.localStorage.setItem("forest.save.v1", raw); g2.load();
      T.ok("복원 후 발견물 유지", g2.lootAt(3,5).stick===6 && g2.lootAt(3,5).berry===0);
      T.ok("복원 후 열매 유지", g2.game.s.bag.berry===4);
      // loot 필드가 없는 구버전 세이브
      const old=JSON.parse(raw); delete old.loot;
      const h=g2.hydrate(old);
      T.ok("loot 없는 구세이브도 안전", typeof h.loot==="object" && Object.keys(h.loot).length===0);
    }

    T.group("[방어] 없는 발견물 줍기 시도");
    {
      const g=newGame(), S=g.game.s; const t0=S.turn;
      g.act("take:stick");                     // 거점, loot 없음
      T.ok("턴 소모 없음", S.turn===t0);
      T.ok("자원 안 늘어남", S.bag.stick===0);
      T.ok("음수 없음", Object.keys(S.bag).every(k=>S.bag[k]>=0));
      toCamp(g); g.act("search"); g.act("take:paper"); g.act("take:paper");
      T.ok("종이 두 번 줍기 무해", g.lootAt(3,5).paper===0 && g.kept("paper")===true);
    }

    T.group("[회귀] 기존 4개 버그가 여전히 막혀 있다");
    {
      const g=newGame(), S=g.game.s;
      S.fuel=20; g.act("bench1");
      T.ok("제작대 재료 검사 유지", S.bench===0 && Object.keys(S.bag).every(k=>S.bag[k]>=0));
      const g2=newGame(); g2.act("light");
      T.ok("점화 재료 검사 유지", g2.game.s.fuel===0 && g2.game.s.bag.stick===0);
      const g3=newGame(); const t=g3.game.s.turn; g3.act("stick");
      T.ok("빈 칸 채집 턴 유지", g3.game.s.turn===t);
      T.ok("hydrate 유지", g3.hydrate({r:99}).r===6);
    }
  }
};
