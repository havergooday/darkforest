const { newGame, acts, bagUI, legend, grid, lastLog, neg, toCamp }
  = require("./harness.js");

module.exports = {
  name: "버그 수정 · 재료 검사 · 세이브 스키마",
  run(T){
    T.group("[버그1] 재료 없이 제작대 건설");
    {
      const g=newGame(), S=g.game.s;
      S.fuel=20;                       // 불만 켜둔 상태
      g.game.give("stick",0);
      const before=JSON.stringify(S.bag);
      g.act("bench1");
      T.ok("제작대가 세워지지 않는다", S.bench===0, "bench="+S.bench);
      T.ok("가방에 음수가 없다", neg(S.bag)==="", neg(S.bag));
      T.ok("자원이 차감되지 않았다", JSON.stringify(S.bag)===before);
      T.ok("소지량이 음수가 아니다", g.carried()>=0, "carried="+g.carried());
    }

    T.group("[버그1] 재료를 갖추면 정상 건설");
    {
      const g=newGame(), S=g.game.s;
      S.fuel=20; g.game.give("stick",10); g.game.give("stone",6);
      g.act("bench1");
      T.ok("제작대 1단계 완성", S.bench===1);
      T.ok("나뭇가지 8 차감", S.bag.stick===2, "stick="+S.bag.stick);
      T.ok("돌 4 차감", S.bag.stone===2, "stone="+S.bag.stone);
      g.act("bench2");   // 돌8·덩굴4 부족
      T.ok("2단계는 재료 부족으로 막힘", S.bench===1, "bench="+S.bench);
      T.ok("여전히 음수 없음", neg(S.bag)==="", neg(S.bag));
    }

    T.group("[버그1] 불 없이 제작대");
    {
      const g=newGame(), S=g.game.s;
      S.fuel=0; g.game.give("stick",10); g.game.give("stone",6);
      g.act("bench1");
      T.ok("불이 꺼져 있으면 막힘", S.bench===0);
      T.ok("자원 그대로", S.bag.stick===10 && S.bag.stone===6);
    }

    T.group("[버그2] 재료 없이 불 피우기 / 장작 넣기");
    {
      const g=newGame(), S=g.game.s;
      g.act("light");
      T.ok("불이 붙지 않는다", S.fuel===0, "fuel="+S.fuel);
      T.ok("나뭇가지 음수 아님", S.bag.stick===0, "stick="+S.bag.stick);
      S.fuel=5; const t=S.turn;
      g.act("feed");
      T.ok("빈손 장작은 턴을 쓰지 않는다", S.turn===t && S.fuel===5, "turn "+t+"->"+S.turn);
      g.game.give("stick",5); g.act("light");
      T.ok("재료가 있으면 불이 붙는다", S.fuel>5 && S.bag.stick===0, "fuel="+S.fuel+" stick="+S.bag.stick);
    }

    T.group("[버그3] 자원 없는 칸에서 채집");
    {
      const g=newGame(), S=g.game.s;
      const t0=S.turn, f0=S.food;
      g.act("stick");                   // 거점(빈터)은 자원 0
      T.ok("턴이 소모되지 않는다", S.turn===t0, "turn "+t0+"->"+S.turn);
      T.ok("허기도 줄지 않는다", S.food===f0, "food "+f0+"->"+S.food);
    }

    T.group("[버그4] 구버전 / 손상된 세이브 복원");
    {
      const g=newGame();
      const legacy={ r:2,c:4, hp:55, food:40, temp:30, fuel:3,
                     bag:{stick:7,berry:2,stone:1,vine:0},      // meat/fish/hide 없음
                     tools:{knife:true, laser:true},            // 미지의 도구
                     day:2, turn:5, night:true, seen:{"3,3":true} };
      const s=g.hydrate(legacy);
      T.ok("기존 값 유지", s.hp===55 && s.day===2 && s.night===true && s.r===2 && s.c===4);
      T.ok("누락 필드가 기본값", s.bag.meat===0 && s.bag.hide===0 && s.bag.fish===0);
      T.ok("신규 필드가 기본값", s.bench===0 && typeof s.keep==="object" && Object.keys(s.keep).length===0 && Array.isArray(s.log));
      T.ok("미지의 도구는 버려짐", s.tools.knife===true && s.tools.laser===undefined, JSON.stringify(s.tools));
      T.ok("stock 객체 보장", typeof s.stock==="object");

      const junk=g.hydrate({ r:99, c:-5, hp:"많음", bag:"없음", tools:null, log:"글자" });
      T.ok("좌표 클램프", junk.r>=0 && junk.r<=6 && junk.c>=0 && junk.c<=6, junk.r+","+junk.c);
      T.ok("잘못된 타입 무시", junk.hp===100 && junk.bag.stick===0, "hp="+junk.hp);
      T.ok("log 배열 보장", Array.isArray(junk.log));
      T.ok("hydrate(null) 안전", g.hydrate(null).hp===100);

      // 실제 저장→불러오기 왕복
      const g2=newGame();
      g2.localStorage.setItem("forest.save.v1", JSON.stringify(legacy));
      g2.load();
      T.ok("load()가 크래시 없이 렌더", g2.game.s.hp===55 && g2.game.s.bag.hide===0);
    }

    T.group("[회귀] 정상 플레이 경로");
    {
      const g=newGame(), S=g.game.s;
      g.move(3,2);                                  // 숲으로
      T.ok("이동 성공", S.r===3 && S.c===2);
      g.act("stick");
      T.ok("채집됨", S.bag.stick>0, "stick="+S.bag.stick);
      g.move(3,3); g.game.give("stick",5); g.act("light");
      T.ok("거점 점화", S.fuel>0 && S.camp===true);
      g.game.give("stick",8); g.game.give("stone",4); g.act("bench1");
      T.ok("제작대 건설", S.bench===1);
      g.game.give("stone",3); g.game.give("stick",2); g.act("knife");
      T.ok("돌칼 제작", S.tools.knife===true);
      T.ok("음수 없음", neg(S.bag)==="", neg(S.bag));
      g.game.tool(); g.game.all(); g.game.reveal(); g.game.skip(5);
      T.ok("콘솔 API 정상", S.bench===2 && g.kept("paper")===true);
    }
  }
};
