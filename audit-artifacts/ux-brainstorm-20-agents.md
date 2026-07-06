# MASI-CO TV Studio UX Brainstorm

Datum: 2026-07-06

Zadani: zjednodusit studio tak, aby ho dokazala obslouzit i prodavacka v provozu bez technickeho kontextu. Jednorazove nastaveni ma byt schovane, denni prace ma byt videt hned.

## 20 review pohledu

1. Prvni pouziti: uvodni obrazovka musi rict jen "vlozit menu" a "zkontrolovat".
2. Denní workflow: hlavni akce ma byt nahore, ne ve vice modulech.
3. Recovery: chybove hlasky musi rikat konkretni dalsi krok.
4. Visual hierarchy: cervena jen pro akci/akcent, ne jako cela plocha.
5. Settings: provozovny, role, sablony a TV patri do rozbalene spravy.
6. Ceska copy: nahradit technicke statusy slovnikem obsluhy.
7. Accessibility: focus ring, live statusy a vetsi klikaci prvky.
8. Mobile emergency: schvaleni a rychla kontrola musi jit i na telefonu.
9. TV confidence: rozlisit "odeslano" od "TV opravdu videla novou verzi".
10. Cognitive load: schovat demo/projektove casti mimo denni tok.
11. Forms: potvrzeni musi nasledovat az po viditelne kontrole obsahu.
12. Success state: vysledek nesmi slibovat, ze TV bezi, dokud to nepotvrdi heartbeat.
13. Edge cases: prazdne datum a zmeneny text nesmi rozbit nebo nechat stare potvrzeni.
14. Roles: navigace a akce maji byt jednodussi pro ne-adminy.
15. Time pressure: minimum kroku pro bezny den.
16. Scanning: karty a statusy maji byt citelne rychlym pohledem.
17. First-use QA: dulezite akce nesmi byt pod dlouhym textarea mimo prvni obrazovku.
18. Production safety: publikace musi cilit konkretni sparovanou TV.
19. Mobile QA: tabulky se na malem displeji meni na karty.
20. Deployment readiness: DB migrace musi respektovat immutable template versions.

## Zapracovane zmeny

- Sidebar ma jen denni obrazovky, sprava je oddelena pro adminy.
- Produkcni domov zacina rychlym spustenim, stav a nastaveni jsou az pod nim.
- Jednorazove volby cile a vzhledu jsou pod "Zmenit cil".
- Produkcni publish vyzaduje konkretni existujici TV a nerotuje jeji token.
- Pred potvrzenim se ukazuje rozpoznany seznam jidel, cen a alergenu.
- Editace textu, data, TV nebo pozadi zrusi stare potvrzeni a vysledek.
- TV heartbeat uklada posledni skutecne videnou verzi.
- Dashboard rozlisuje "ceka na TV" od hotoveho stavu.
- Mobilni tabulky menu se zobrazuji jako karty.
- Nova migrace znovu nasazuje safe RPC bez update immutable template payloadu.

## Overeni

- `pnpm --filter @masico/web typecheck`
- `pnpm --filter @masico/web lint`
- `pnpm --filter @masico/web test`
- `pnpm --filter @masico/web build`
