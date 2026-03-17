import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Switch,
  Dimensions,
} from "react-native";

// ── Types ──────────────────────────────────────────────────────────
type Joueur = 1 | 2;
type Case = 0 | Joueur;
type Grille = Case[][];
type Position = [number, number];

const VIDE = 0;
const NOIR = 1;
const BLANC = 2;
const TAILLE = 9;

// // Taille de cellule responsive
// const SCREEN = Dimensions.get("window").width;
// const CELLULE = Math.floor((SCREEN - 32) / TAILLE);

const creerGrille = (): Grille =>
  Array.from({ length: TAILLE }, () => Array(TAILLE).fill(VIDE) as Case[]);

const cle = (l: number, c: number) => `${l},${c}`;

const adjacentes = (l: number, c: number): Position[] =>
  ([[l-1,c],[l+1,c],[l,c-1],[l,c+1]] as Position[])
    .filter(([a, b]) => a >= 0 && a < TAILLE && b >= 0 && b < TAILLE);

// ══════════════════════════════════════════════════════════════════
// FARITRA — Détection des zones fermées (logique testée et validée)
//
// Algorithme en 3 étapes :
//
//  1. Pour chaque joueur J (propriétaire potentiel), flood depuis
//     toute case qui N'EST PAS une pierre de J (cases VIDES et
//     pierres adverses). Le flood s'arrête sur les pierres de J.
//
//  2. Si le flood NE TOUCHE PAS le bord du plateau → la zone est
//     hermétiquement fermée par les pierres de J.
//
//  3. Compter les pierres adverses dans la zone → points pour J.
//
// L'orthogonalité est garantie automatiquement : le flood ne se
// déplace qu'en H/V, donc toute zone délimitée est un polygone
// orthogonal (comme tracer sur papier quadrillé).
// ══════════════════════════════════════════════════════════════════

type ZoneFermee = {
  proprio: Joueur;
  pierres: string[];          // clés des pierres adverses capturées
  interieures: Set<string>;   // toutes les cases intérieures (pour affichage)
};

// ── Vérification orthogonalité du contour ────────────────────────
// Règle : entre deux pierres du proprio diagonalement adjacentes,
// il doit exister au moins un pont orthogonal (une des deux cases
// "pont" entre elles doit aussi être du proprio).
// Sinon le contour a un lien diagonal → INVALIDE.
function contourZoneEstOrthogonal(
  interieures: Set<string>,
  grille: Grille,
  proprio: Joueur,
): boolean {
  // Trouver les pierres du proprio qui bordent directement la zone
  const bordure = new Set<string>();
  for (const ik of interieures) {
    const [il, ic] = ik.split(",").map(Number);
    for (const [nl, nc] of adjacentes(il, ic)) {
      if (grille[nl][nc] === proprio) bordure.add(cle(nl, nc));
    }
  }
  // Vérifier chaque carré 2×2 impliquant la bordure
  const checked = new Set<string>();
  for (const bk of bordure) {
    const [bl, bc] = bk.split(",").map(Number);
    for (const [dl, dc] of [[-1,-1],[-1,0],[0,-1],[0,0]] as [number,number][]) {
      const r = bl + dl, c = bc + dc;
      if (r < 0 || r + 1 >= TAILLE || c < 0 || c + 1 >= TAILLE) continue;
      const ck = `${r},${c}`;
      if (checked.has(ck)) continue;
      checked.add(ck);
      const a  = grille[r  ][c  ] === proprio;
      const b  = grille[r  ][c+1] === proprio;
      const p  = grille[r+1][c  ] === proprio;
      const d  = grille[r+1][c+1] === proprio;
      // Deux pierres en diagonale sans aucun pont ortho → INVALIDE
      if (a && d && !b && !p) return false;
      if (b && p && !a && !d) return false;
    }
  }
  return true;
}

function detecterZonesFermees(grille: Grille): ZoneFermee[] {
  const zones: ZoneFermee[] = [];

  for (const proprio of [NOIR, BLANC] as Joueur[]) {
    const adversaire: Joueur = proprio === NOIR ? BLANC : NOIR;
    const visitees = new Set<string>();

    for (let sl = 0; sl < TAILLE; sl++) {
      for (let sc = 0; sc < TAILLE; sc++) {
        // Démarrer depuis toute case qui n'est PAS une pierre du proprio
        if (grille[sl][sc] === proprio) continue;
        const sk = cle(sl, sc);
        if (visitees.has(sk)) continue;

        // Flood : traverse VIDE + pierres adverses, stop sur pierres du proprio
        const inter = new Set<string>([sk]);
        let toucheBord = false;
        const file: Position[] = [[sl, sc]];

        while (file.length) {
          const [fl, fc] = file.pop()!;
          if (fl === 0 || fl === TAILLE - 1 || fc === 0 || fc === TAILLE - 1) {
            toucheBord = true;
          }
          for (const [nl, nc] of adjacentes(fl, fc)) {
            const nk = cle(nl, nc);
            if (inter.has(nk)) continue;
            if (grille[nl][nc] === proprio) continue; // mur = stop
            inter.add(nk);
            file.push([nl, nc]);
          }
        }

        // Marquer la région comme visitée (évite de la retraiter)
        inter.forEach(k => visitees.add(k));

        // Zone ouverte → pas de capture
        if (toucheBord) continue;

        // ── Vérification orthogonalité du contour ──────────────
        if (!contourZoneEstOrthogonal(inter, grille, proprio)) continue;

        // Compter les pierres adverses à l'intérieur
        const pierres: string[] = [];
        for (const ik of inter) {
          const [il, ic] = ik.split(",").map(Number);
          if (grille[il][ic] === adversaire) pierres.push(ik);
        }

        // Pas de pièrres adverses → zone valide mais 0 point
        if (pierres.length === 0) continue;

        zones.push({ proprio, pierres, interieures: inter });
      }
    }
  }

  return zones;
}

// ── Jouer un coup ──────────────────────────────────────────────────
function jouer(
  grille: Grille,
  l: number,
  c: number,
  joueur: Joueur,
  hashPrecedent: string,
): [Grille, number, string] | null {
  if (grille[l][c] !== VIDE) return null;

  const g: Grille = grille.map(row => [...row]);
  g[l][c] = joueur;

  // Détecter et appliquer les captures
  const zones = detecterZonesFermees(g);
  let captures = 0;
  for (const zone of zones) {
    if (zone.proprio !== joueur) continue;
    captures += zone.pierres.length;
    for (const pk of zone.pierres) {
      const [pl, pc] = pk.split(",").map(Number);
      g[pl][pc] = VIDE;
    }
  }

  // Ko : interdire la répétition de position
  const hash = JSON.stringify(g);
  if (hash === hashPrecedent) return null;

  return [g, captures, hash];
}

// ── IA ─────────────────────────────────────────────────────────────
function evaluerPotentiel(grille: Grille): number {
  let score = 0;
  const vus = new Set<string>();
  for (let l = 0; l < TAILLE; l++) {
    for (let c = 0; c < TAILLE; c++) {
      if (grille[l][c] !== VIDE) continue;
      const k = cle(l, c);
      if (vus.has(k)) continue;
      const region = new Set<string>([k]);
      const file: Position[] = [[l, c]];
      let bord = false, nbN = 0, nbB = 0;
      while (file.length) {
        const [fl, fc] = file.pop()!;
        if (fl===0||fl===TAILLE-1||fc===0||fc===TAILLE-1) bord = true;
        for (const [nl, nc] of adjacentes(fl, fc)) {
          const nk = cle(nl, nc), v = grille[nl][nc];
          if (v === VIDE) { if (!region.has(nk)) { region.add(nk); file.push([nl, nc]); } }
          else if (v === NOIR) nbN++;
          else nbB++;
        }
      }
      region.forEach(rk => vus.add(rk));
      if (bord) continue;
      if (nbB > 0 && nbN === 0) score += region.size * 30;
      else if (nbB > nbN * 2)   score += region.size * 12;
      else if (nbB > nbN)       score += region.size * 5;
    }
  }
  return score;
}

function evaluerBlocage(grille: Grille, l: number, c: number): number {
  let score = 0;
  for (const [nl, nc] of adjacentes(l, c)) {
    if (grille[nl][nc] !== NOIR) continue;
    const vus = new Set<string>([cle(nl, nc)]);
    const file: Position[] = [[nl, nc]];
    while (file.length) {
      const [fl, fc] = file.pop()!;
      for (const [al, ac] of adjacentes(fl, fc)) {
        const ak = cle(al, ac);
        if (!vus.has(ak) && grille[al][ac] === NOIR) { vus.add(ak); file.push([al, ac]); }
      }
    }
    if (vus.size >= 3) score += vus.size * 10;
  }
  return score;
}

function coupIA(grille: Grille, hashPrecedent: string): Position | null {
  let best = -Infinity;
  let meilleurs: Position[] = [];
  const centre = (TAILLE - 1) / 2;

  for (let l = 0; l < TAILLE; l++) {
    for (let c = 0; c < TAILLE; c++) {
      if (grille[l][c] !== VIDE) continue;
      const res = jouer(grille, l, c, BLANC, hashPrecedent);
      if (!res) continue;
      const [ng, captures] = res;
      let score =
        captures * 1500 +
        evaluerPotentiel(ng) +
        evaluerBlocage(grille, l, c) -
        (Math.abs(l - centre) + Math.abs(c - centre)) * 3;
      for (const [nl, nc] of adjacentes(l, c)) {
        if (grille[nl][nc] === BLANC) score += 20;
      }
      if (score > best) { best = score; meilleurs = [[l, c]]; }
      else if (score === best) meilleurs.push([l, c]);
    }
  }
  return meilleurs.length
    ? meilleurs[Math.floor(Math.random() * meilleurs.length)]
    : null;
}

// ── Composant principal ───────────────────────────────────────────
export default function App() {
  const [grille, setGrille] = useState<Grille>(creerGrille);
  const [tour, setTour]     = useState<Joueur>(NOIR);
  const [vsIA, setVsIA]     = useState(false);
  const [msg, setMsg]       = useState("");
  const [fini, setFini]     = useState(false);
  const [vainqueur, setVainqueur] = useState("");
  const [scoreN, setScoreN] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [zones, setZones]   = useState<ZoneFermee[]>([]);

  const gRef    = useRef<Grille>(grille);
  const hashRef = useRef("");
  const passRef = useRef(0);
  const finiRef = useRef(false);
  const sNRef   = useRef(0);
  const sBRef   = useRef(0);

  const reset = useCallback(() => {
    const g = creerGrille();
    gRef.current = g; hashRef.current = "";
    passRef.current = 0; finiRef.current = false;
    sNRef.current = 0; sBRef.current = 0;
    setGrille(g); setTour(NOIR);
    setScoreN(0); setScoreB(0);
    setMsg(""); setFini(false); setVainqueur(""); setZones([]);
  }, []);

  const terminer = useCallback(() => {
    finiRef.current = true;
    setFini(true);
    const sN = sNRef.current, sB = sBRef.current;
    setVainqueur(sN > sB ? "noir" : sB > sN ? "blanc" : "egal");
    setMsg(`${sN} — ${sB}`);
  }, []);

  const appliquerCoup = useCallback((g: Grille, joueur: Joueur, l: number, c: number): boolean => {
    if (finiRef.current) return false;
    const res = jouer(g, l, c, joueur, hashRef.current);
    if (!res) { setMsg("—"); return false; }
    const [ng, captures, hash] = res;
    hashRef.current = hash;
    passRef.current = 0;
    gRef.current = ng;
    if (joueur === NOIR) { sNRef.current += captures; setScoreN(sNRef.current); }
    else                 { sBRef.current += captures; setScoreB(sBRef.current); }
    setZones(detecterZonesFermees(ng));
    setMsg(captures > 0 ? `+${captures}` : "");
    setGrille(ng);
    setTour(joueur === NOIR ? BLANC : NOIR);
    return true;
  }, []);

  const appliquerPasse = useCallback((joueur: Joueur): boolean => {
    if (finiRef.current) return false;
    passRef.current += 1;
    setMsg("passe");
    if (passRef.current >= 2) terminer();
    else setTour(joueur === NOIR ? BLANC : NOIR);
    return true;
  }, [terminer]);

  const tourRef = useRef<Joueur>(NOIR);
  tourRef.current = tour;

  const appuyerCase = (l: number, c: number) => {
    if (finiRef.current) return;
    if (vsIA && tourRef.current === BLANC) return;
    const joueur: Joueur = vsIA ? NOIR : tourRef.current;
    const ok = appliquerCoup(gRef.current, joueur, l, c);
    if (ok && vsIA) {
      setTimeout(() => {
        if (finiRef.current) return;
        const pos = coupIA(gRef.current, hashRef.current);
        if (pos) appliquerCoup(gRef.current, BLANC, pos[0], pos[1]);
        else     appliquerPasse(BLANC);
      }, 280);
    }
  };

  const passer = () => {
    if (finiRef.current) return;
    if (vsIA && tourRef.current === BLANC) return;
    const ok = appliquerPasse(tourRef.current);
    if (ok && vsIA && !finiRef.current) {
      setTimeout(() => {
        if (finiRef.current) return;
        const pos = coupIA(gRef.current, hashRef.current);
        if (pos) appliquerCoup(gRef.current, BLANC, pos[0], pos[1]);
        else     appliquerPasse(BLANC);
      }, 280);
    }
  };

  const surb = new Map<string, Joueur>();
  for (const z of zones)
    for (const ik of z.interieures) surb.set(ik, z.proprio);

  return (
    <View style={s.root}>

      {/* ── Header ── */}
      <View style={s.header}>
        <Text style={s.logo}>faritra</Text>
        <TouchableOpacity onPress={reset} activeOpacity={0.5}>
          <Text style={s.resetBtn}>↺</Text>
        </TouchableOpacity>
      </View>

      {/* ── Scores ── */}
      <View style={s.scoreRow}>
        <View style={[s.scoreBlock, tour===NOIR && !fini && s.scoreActive]}>
          <View style={[s.dot, s.dotN]} />
          <Text style={s.scoreNum}>{scoreN}</Text>
        </View>

        <View style={s.centerBlock}>
          <Text style={s.msgTxt}>{msg || (fini ? "" : tour===NOIR ? "●" : "○")}</Text>
        </View>

        <View style={[s.scoreBlock, s.scoreBlockR, tour===BLANC && !fini && s.scoreActiveR]}>
          <Text style={[s.scoreNum, s.scoreNumR]}>{scoreB}</Text>
          <View style={[s.dot, s.dotB]} />
        </View>
      </View>

      {/* ── Plateau ── */}
      <View style={s.boardWrap}>
        <View style={[s.board, { width: TAILLE*CELLULE, height: TAILLE*CELLULE }]}>

          {/* Lignes grille */}
          {Array.from({ length: TAILLE }).map((_, i) => (
            <React.Fragment key={`g${i}`}>
              <View style={[s.lineH, { top:(i+0.5)*CELLULE, left:CELLULE/2, right:CELLULE/2 }]} />
              <View style={[s.lineV, { left:(i+0.5)*CELLULE, top:CELLULE/2, bottom:CELLULE/2 }]} />
            </React.Fragment>
          ))}

          {/* Hoshi */}
          {[[2,2],[2,6],[4,4],[6,2],[6,6]].map(([hl,hc]) => (
            <View key={`h${hl}${hc}`} style={[s.hoshi, {
              top:(hl+0.5)*CELLULE-2.5, left:(hc+0.5)*CELLULE-2.5,
            }]} />
          ))}

          {/* Cases */}
          {grille.map((row, l) => row.map((val, c) => {
            const k = cle(l, c);
            const prop = surb.get(k);
            return (
              <TouchableOpacity
                key={k}
                activeOpacity={0.8}
                style={[
                  s.cell,
                  { top:l*CELLULE, left:c*CELLULE, width:CELLULE, height:CELLULE },
                  prop !== undefined && val === VIDE && {
                    backgroundColor: prop===NOIR
                      ? "rgba(0,0,0,0.07)"
                      : "rgba(0,0,0,0.04)",
                  },
                ]}
                onPress={() => appuyerCase(l, c)}
                disabled={val!==VIDE || (vsIA && tour===BLANC) || fini}
              >
                {val !== VIDE && (
                  <View style={[
                    s.stone,
                    { width:CELLULE*0.76, height:CELLULE*0.76, borderRadius:CELLULE*0.38 },
                    val===NOIR ? s.stoneN : s.stoneB,
                  ]} />
                )}
              </TouchableOpacity>
            );
          }))}
        </View>
      </View>

      {/* ── Controls ── */}
      <View style={s.controls}>
        <TouchableOpacity
          style={s.passBtn}
          onPress={passer}
          disabled={fini}
          activeOpacity={0.5}
        >
          <Text style={s.passTxt}>passer</Text>
        </TouchableOpacity>

        <View style={s.modeToggle}>
          <Text style={[s.modeLabel, !vsIA && s.modeLabelOn]}>2J</Text>
          <Switch
            value={vsIA}
            onValueChange={v => { setVsIA(v); reset(); }}
            trackColor={{ false:"#DDD", true:"#222" }}
            thumbColor="#FFF"
            style={{ transform:[{scaleX:0.8},{scaleY:0.8}] }}
          />
          <Text style={[s.modeLabel, vsIA && s.modeLabelOn]}>IA</Text>
        </View>
      </View>

      {/* ── Fin de partie ── */}
      {fini && (
        <View style={s.overlay}>
          <View style={s.winBox}>
            <Text style={s.winTitle}>
              {vainqueur==="egal" ? "égalité" : vainqueur==="noir" ? "noir gagne" : "blanc gagne"}
            </Text>
            <Text style={s.winScore}>{scoreN} — {scoreB}</Text>
            <TouchableOpacity onPress={reset} activeOpacity={0.6} style={s.winBtn}>
              <Text style={s.winBtnTxt}>rejouer</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Styles minimalistes ───────────────────────────────────────────
const SCREEN = Dimensions.get("window").width;
const CELLULE = Math.floor((SCREEN - 32) / TAILLE);

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F7F5F0",
    paddingTop: 56,
    alignItems: "center",
  },

  // Header
  header: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    marginBottom: 28,
  },
  logo: {
    fontSize: 22,
    fontWeight: "300",
    color: "#111",
    letterSpacing: 6,
  },
  resetBtn: {
    fontSize: 22,
    color: "#999",
    fontWeight: "300",
  },

  // Scores
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  scoreBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  scoreBlockR: {
    justifyContent: "flex-end",
  },
  scoreActive: {
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  scoreActiveR: {
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotN: { backgroundColor: "#111" },
  dotB: { backgroundColor: "#FFF", borderWidth: 1.5, borderColor: "#999" },
  scoreNum: {
    fontSize: 28,
    fontWeight: "200",
    color: "#111",
    letterSpacing: 1,
  },
  scoreNumR: {
    textAlign: "right",
  },
  centerBlock: {
    alignItems: "center",
    minWidth: 40,
  },
  msgTxt: {
    fontSize: 14,
    color: "#999",
    fontWeight: "300",
    letterSpacing: 1,
  },

  // Plateau
  boardWrap: {
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 24,
  },
  board: {
    backgroundColor: "#EDE8DC",
    position: "relative",
  },
  lineH: {
    position: "absolute",
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#B8AE98",
  },
  lineV: {
    position: "absolute",
    width: StyleSheet.hairlineWidth,
    backgroundColor: "#B8AE98",
  },
  hoshi: {
    position: "absolute",
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#9E9483",
  },
  cell: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  stone: {
    borderWidth: 0,
  },
  stoneN: {
    backgroundColor: "#111",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  stoneB: {
    backgroundColor: "#F5F2EC",
    borderWidth: 1,
    borderColor: "#C8C0B0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },

  // Controls
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 24,
  },
  passBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#CCC",
    borderRadius: 20,
  },
  passTxt: {
    fontSize: 13,
    color: "#666",
    fontWeight: "400",
    letterSpacing: 1,
  },
  modeToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  modeLabel: {
    fontSize: 12,
    color: "#CCC",
    fontWeight: "500",
    letterSpacing: 1,
  },
  modeLabelOn: {
    color: "#333",
  },

  // Fin de partie
  overlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(247,245,240,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  winBox: {
    alignItems: "center",
    gap: 12,
  },
  winTitle: {
    fontSize: 28,
    fontWeight: "200",
    color: "#111",
    letterSpacing: 4,
  },
  winScore: {
    fontSize: 42,
    fontWeight: "100",
    color: "#555",
    letterSpacing: 4,
  },
  winBtn: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#999",
    borderRadius: 20,
  },
  winBtnTxt: {
    fontSize: 13,
    color: "#555",
    letterSpacing: 2,
    fontWeight: "400",
  },
});
