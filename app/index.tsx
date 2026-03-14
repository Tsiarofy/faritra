import React, { useState, useCallback, useRef } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Switch } from "react-native";

// ── Types & Constantes ─────────────────────────────────────────────
type Joueur = 1 | 2;          // 1 = Noir, 2 = Blanc
type Case = 0 | Joueur;
type Grille = Case[][];
type Position = [number, number];

const VIDE = 0;
const NOIR = 1;
const BLANC = 2;
const TAILLE_INITIALE = 9;
const EXTENSION = 4;           // 9 → 17
const TAILLE_MAX = TAILLE_INITIALE + EXTENSION * 2;
const TAILLE_CELLULE = 40;

const creerGrille = (taille: number): Grille => 
  Array.from({ length: taille }, () => Array(taille).fill(VIDE));

const cle = (ligne: number, colonne: number) => `${ligne},${colonne}`;

const adjacentes = (ligne: number, colonne: number, taille: number): Position[] =>
  [[ligne-1, colonne], [ligne+1, colonne], [ligne, colonne-1], [ligne, colonne+1]]
    .filter(([l, c]) => l >= 0 && l < taille && c >= 0 && c < taille) as Position[];

// ── Groupe + libertés ──────────────────────────────────────────────
function groupeDe(grille: Grille, ligne: number, colonne: number, taille: number) {
  const couleur = grille[ligne][colonne];
  const groupe = new Set<string>();
  const libertes = new Set<string>();
  const file: Position[] = [[ligne, colonne]];
  groupe.add(cle(ligne, colonne));

  while (file.length) {
    const [l, c] = file.pop()!;
    for (const [nl, nc] of adjacentes(l, c, taille)) {
      const k = cle(nl, nc);
      if (grille[nl][nc] === VIDE) libertes.add(k);
      else if (grille[nl][nc] === couleur && !groupe.has(k)) {
        groupe.add(k);
        file.push([nl, nc]);
      }
    }
  }
  return { groupe, libertes };
}

// ── Jouer un coup (avec règle du Ko) ───────────────────────────────
function jouer(
  grille: Grille,
  ligne: number,
  colonne: number,
  joueur: Joueur,
  taille: number,
  hashPrecedent: string
): [Grille, number, string] | null {
  if (grille[ligne][colonne] !== VIDE) return null;

  const nouvelleGrille: Grille = grille.map(ligne => [...ligne]);
  nouvelleGrille[ligne][colonne] = joueur;

  const adversaire = joueur === NOIR ? BLANC : NOIR;
  let captures = 0;

  for (const [nl, nc] of adjacentes(ligne, colonne, taille)) {
    if (nouvelleGrille[nl][nc] === adversaire) {
      const { groupe, libertes } = groupeDe(nouvelleGrille, nl, nc, taille);
      if (libertes.size === 0) {
        captures += groupe.size;
        groupe.forEach(k => {
          const [a, b] = k.split(",").map(Number);
          nouvelleGrille[a][b] = VIDE;
        });
      }
    }
  }

  if (groupeDe(nouvelleGrille, ligne, colonne, taille).libertes.size === 0) {
    return null; // suicide
  }

  const nouveauHash = JSON.stringify(nouvelleGrille);
  if (nouveauHash === hashPrecedent) return null; // Ko

  return [nouvelleGrille, captures, nouveauHash];
}

// ── Calcul du territoire (zones entièrement entourées) ─────────────
function territoire(grille: Grille, taille: number): [number, number] {
  const visite = creerGrille(taille);
  let [territoireNoir, territoireBlanc] = [0, 0];

  for (let ligne = 0; ligne < taille; ligne++) {
    for (let colonne = 0; colonne < taille; colonne++) {
      if (grille[ligne][colonne] || visite[ligne][colonne]) continue;

      const region: Position[] = [];
      const bordures = new Set<Joueur>();
      const file: Position[] = [[ligne, colonne]];
      visite[ligne][colonne] = 1;

      while (file.length) {
        const [l, c] = file.pop()!;
        region.push([l, c]);
        for (const [nl, nc] of adjacentes(l, c, taille)) {
          if (grille[nl][nc]) bordures.add(grille[nl][nc]);
          else if (!visite[nl][nc]) {
            visite[nl][nc] = 1;
            file.push([nl, nc]);
          }
        }
      }

      if (bordures.size === 1) {
        const proprietaire = [...bordures][0];
        if (proprietaire === NOIR) territoireNoir += region.length;
        else territoireBlanc += region.length;
      }
    }
  }
  return [territoireNoir, territoireBlanc];
}

// ── IA simple (greedy sur territoire) ──────────────────────────────
function coupIA(grille: Grille, taille: number): Position | null {
  let meilleurScore = -Infinity;
  let meilleursCoups: Position[] = [];

  for (let ligne = 0; ligne < taille; ligne++) {
    for (let colonne = 0; colonne < taille; colonne++) {
      const resultat = jouer(grille, ligne, colonne, BLANC, taille, "");
      if (!resultat) continue;
      const [nouvelleGrille] = resultat;
      const [tn, tb] = territoire(nouvelleGrille, taille);
      const score = tb - tn;
      if (score > meilleurScore) {
        meilleurScore = score;
        meilleursCoups = [[ligne, colonne]];
      } else if (score === meilleurScore) {
        meilleursCoups.push([ligne, colonne]);
      }
    }
  }

  return meilleursCoups.length
    ? meilleursCoups[Math.floor(Math.random() * meilleursCoups.length)]
    : null;
}

// ── Application principale ─────────────────────────────────────────
export default function App() {
  const [taille, setTaille] = useState(TAILLE_INITIALE);
  const [grille, setGrille] = useState<Grille>(creerGrille(TAILLE_INITIALE));
  const [tour, setTour] = useState<Joueur>(NOIR);
  const [contreIA, setContreIA] = useState(false);
  const [message, setMessage] = useState("");
  const [partieTerminee, setPartieTerminee] = useState(false);
  const [vainqueur, setVainqueur] = useState("");

  const hashPrecedentRef = useRef<string>("");
  const aEteEtendueRef = useRef(false);
  const passesConsecutivesRef = useRef(0);

  const reinitialiser = () => {
    setTaille(TAILLE_INITIALE);
    setGrille(creerGrille(TAILLE_INITIALE));
    setTour(NOIR);
    setMessage("");
    setPartieTerminee(false);
    setVainqueur("");
    hashPrecedentRef.current = "";
    aEteEtendueRef.current = false;
    passesConsecutivesRef.current = 0;
  };

  const terminerPartie = (grilleFinale: Grille, tailleFinale: number) => {
    const [terNoir, terBlanc] = territoire(grilleFinale, tailleFinale);
    const noirGagne = terNoir > terBlanc;
    const blancGagne = terBlanc > terNoir;

    setPartieTerminee(true);
    if (noirGagne) setVainqueur("NOIR ⚫ GAGNE !");
    else if (blancGagne) setVainqueur("BLANC ⚪ GAGNE !");
    else setVainqueur("ÉGALITÉ");

    setMessage(`Noir : ${terNoir} pts\nBlanc : ${terBlanc} pts`);
  };

  const gererCoup = useCallback((
    ligne: number,
    colonne: number,
    grilleActuelle: Grille,
    tailleActuelle: number,
    joueurActuel: Joueur,
    estPasser: boolean = false
  ): boolean => {
    if (partieTerminee) return false;

    if (estPasser) {
      passesConsecutivesRef.current++;
      setMessage(joueurActuel === NOIR ? "Blanc passe" : "Noir passe");
      if (passesConsecutivesRef.current >= 2) {
        terminerPartie(grilleActuelle, tailleActuelle);
        return true;
      }
      setTour(joueurActuel === NOIR ? BLANC : NOIR);
      return true;
    }

    const resultat = jouer(grilleActuelle, ligne, colonne, joueurActuel, tailleActuelle, hashPrecedentRef.current);
    if (!resultat) {
      setMessage("Coup illégal");
      return false;
    }

    const [nouvelleGrille, , nouveauHash] = resultat;
    hashPrecedentRef.current = nouveauHash;
    passesConsecutivesRef.current = 0;

    // Expansion unique si grille pleine
    const estPleine = nouvelleGrille.every(ligne => ligne.every(x => x !== VIDE));
    if (estPleine && !aEteEtendueRef.current) {
      const nouvelleTaille = TAILLE_MAX;
      const nouvelleGrilleEtendue = creerGrille(nouvelleTaille);
      const decalage = EXTENSION;
      for (let i = 0; i < tailleActuelle; i++) {
        for (let j = 0; j < tailleActuelle; j++) {
          nouvelleGrilleEtendue[i + decalage][j + decalage] = nouvelleGrille[i][j];
        }
      }
      setTaille(nouvelleTaille);
      setGrille(nouvelleGrilleEtendue);
      aEteEtendueRef.current = true;
      setTimeout(() => terminerPartie(nouvelleGrilleEtendue, nouvelleTaille), 400);
      return true;
    }

    setGrille(nouvelleGrille);
    setTour(joueurActuel === NOIR ? BLANC : NOIR);
    return true;
  }, [partieTerminee]);

  const appuyerCase = (ligne: number, colonne: number) => {
    gererCoup(ligne, colonne, grille, taille, tour);
    if (contreIA && tour === BLANC && !partieTerminee) {
      setTimeout(() => {
        const position = coupIA(grille, taille);
        if (position) gererCoup(position[0], position[1], grille, taille, BLANC);
      }, 300);
    }
  };

  const passerTour = () => gererCoup(0, 0, grille, taille, tour, true);

  const [terNoir, terBlanc] = territoire(grille, taille);

  return (
    <View style={styles.racine}>
      <Text style={styles.titre}>FARITRA</Text>

      {/* Scores en cours */}
      <View style={styles.rangee}>
        {[NOIR, BLANC].map(j => (
          <View
            key={j}
            style={[
              styles.carte,
              {
                backgroundColor: j === NOIR ? "#1C1C30" : "#F0F0F0",
                borderColor: tour === j ? "#FFD700" : "transparent",
              },
            ]}
          >
            <Text style={[styles.titreCarte, { color: j === NOIR ? "#FFF" : "#000" }]}>
              {j === NOIR ? "Noir ⚫" : "Blanc ⚪"}
            </Text>
            <Text style={[styles.scoreCarte, { color: j === NOIR ? "#FFF" : "#000" }]}>
              🏠 {j === NOIR ? terNoir : terBlanc}
            </Text>
          </View>
        ))}
      </View>

      {message ? <Text style={styles.message}>{message}</Text> : null}

      {/* Plateau */}
      <ScrollView horizontal>
        <ScrollView>
          <View style={[styles.plateau, { width: taille * TAILLE_CELLULE, height: taille * TAILLE_CELLULE }]}>
            {Array.from({ length: taille }).map((_, i) => (
              <React.Fragment key={`lignes${i}`}>
                <View
                  style={[
                    styles.ligne,
                    { top: i * TAILLE_CELLULE + TAILLE_CELLULE / 2, left: TAILLE_CELLULE / 2, width: (taille - 1) * TAILLE_CELLULE },
                  ]}
                />
                <View
                  style={[
                    styles.ligne,
                    { left: i * TAILLE_CELLULE + TAILLE_CELLULE / 2, top: TAILLE_CELLULE / 2, height: (taille - 1) * TAILLE_CELLULE, width: 1 },
                  ]}
                />
              </React.Fragment>
            ))}

            {grille.map((rangee, ligne) =>
              rangee.map((case_, colonne) => (
                <TouchableOpacity
                  key={cle(ligne, colonne)}
                  style={[styles.case, { top: ligne * TAILLE_CELLULE, left: colonne * TAILLE_CELLULE }]}
                  onPress={() => appuyerCase(ligne, colonne)}
                  disabled={case_ !== VIDE || (contreIA && tour === BLANC) || partieTerminee}
                >
                  {case_ !== VIDE && (
                    <View
                      style={[
                        styles.pierre,
                        {
                          backgroundColor: case_ === NOIR ? "#111" : "#EEE",
                          borderColor: case_ === NOIR ? "#333" : "#AAA",
                        },
                      ]}
                    />
                  )}
                </TouchableOpacity>
              ))
            )}
          </View>
        </ScrollView>
      </ScrollView>

      {/* Contrôles */}
      <View style={styles.controles}>
        <View style={styles.rangee}>
          <Text style={styles.etiquette}>{contreIA ? "🤖 IA" : "👥 2 Joueurs"}</Text>
          <Switch value={contreIA} onValueChange={v => { setContreIA(v); reinitialiser(); }} />
        </View>

        <TouchableOpacity style={styles.boutonPasser} onPress={passerTour} disabled={partieTerminee}>
          <Text style={styles.texteBouton}>PASSER</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.bouton} onPress={reinitialiser}>
          <Text style={styles.texteBouton}>↺ Recommencer</Text>
        </TouchableOpacity>
      </View>

      {partieTerminee && (
        <View style={styles.overlayFin}>
          <Text style={styles.texteVainqueur}>{vainqueur}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  racine: { flex: 1, backgroundColor: "#0A0A18", paddingTop: 50 },
  titre: { textAlign: "center", fontSize: 26, fontWeight: "900", color: "#FFD700", letterSpacing: 8, marginBottom: 16 },
  rangee: { flexDirection: "row", justifyContent: "space-around", marginHorizontal: 12, gap: 12 },
  carte: { flex: 1, borderRadius: 12, padding: 14, borderWidth: 3, alignItems: "center" },
  titreCarte: { fontWeight: "800", fontSize: 16 },
  scoreCarte: { fontSize: 28, fontWeight: "900", marginTop: 6 },
  message: { textAlign: "center", color: "#FFD700", fontSize: 16, fontWeight: "700", marginVertical: 10 },
  plateau: { backgroundColor: "#C8A050", borderWidth: 5, borderColor: "#8A6020", margin: 12, borderRadius: 8 },
  ligne: { position: "absolute", backgroundColor: "#5A3A10", opacity: 0.8 },
  case: { position: "absolute", width: TAILLE_CELLULE, height: TAILLE_CELLULE, alignItems: "center", justifyContent: "center" },
  pierre: { width: TAILLE_CELLULE * 0.78, height: TAILLE_CELLULE * 0.78, borderRadius: TAILLE_CELLULE * 0.39, borderWidth: 3 },
  controles: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", margin: 12, backgroundColor: "#14142A", borderRadius: 14, padding: 14 },
  etiquette: { color: "#A0A0CC", fontWeight: "700", fontSize: 16 },
  bouton: { backgroundColor: "#24245A", borderRadius: 10, paddingHorizontal: 18, paddingVertical: 12 },
  boutonPasser: { backgroundColor: "#FFAA00", borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  texteBouton: { color: "#FFF", fontWeight: "800", fontSize: 16 },
  overlayFin: { position: "absolute", top: "40%", left: 0, right: 0, alignItems: "center" },
  texteVainqueur: { fontSize: 32, fontWeight: "900", color: "#FFD700", textAlign: "center", textShadowColor: "#000", textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 4 },
});