# Levantamento — novos países e jogadores reais

Objetivo: expandir o jogo para deixar as copas continentais realistas.
Cada país entra no padrão atual (40 clubes → Série A 20 + Série B 20,
redistribuídos por `baseBudget` no `build-clubs.mjs`).

## Prioridade América do Sul (Libertadores)

### Uruguai (UY)
Peñarol, Nacional, Defensor Sporting, Danubio, Liverpool-URU, Montevideo
Wanderers, River Plate-URU, Cerro, Rampla Juniors, Boston River, Montevideo
City Torque, Racing-URU, Fénix, Cerro Largo, Progreso, Plaza Colonia,
Deportivo Maldonado, Juventud de Las Piedras, Miramar Misiones, Villa
Española, Sud América, Rentistas, Bella Vista, Central Español, Atenas,
Colón-URU, Uruguay Montevideo, Albion, Tacuarembó, La Luz, Potencia,
Salto, Cooper, Basáñez, Canadian, Oriental, Paysandú FC, Durazno,
Cerrito, Torque B*
> Históricos de Libertadores: Peñarol (5 títulos), Nacional (3), Defensor, Danubio, Wanderers.

### Colômbia (CO)
Atlético Nacional, Millonarios, América de Cali, Deportivo Cali, Junior
Barranquilla, Independiente Santa Fe, Once Caldas, Deportes Tolima,
Independiente Medellín, Atlético Bucaramanga, Deportivo Pereira, Águilas
Doradas, Envigado, La Equidad, Alianza Petrolera, Boyacá Chicó, Deportivo
Pasto, Jaguares de Córdoba, Fortaleza CEIF, Patriotas, Unión Magdalena,
Real Cartagena, Cúcuta Deportivo, Atlético Huila, Deportes Quindío,
Cortuluá, Llaneros, Valledupar, Bogotá FC, Tigres-CO, Real Santander,
Barranquilla FC, Leones, Orsomarso, Atlético FC, Boca Juniors de Cali,
Internacional de Palmira, Real Soacha, Popayán, Inter de Bogotá
> Históricos de Libertadores: Atlético Nacional (2 títulos), Once Caldas (1), América, Cali, Millonarios, Junior, Santa Fe, Medellín, Tolima.

### Chile (CL)
Colo-Colo, Universidad de Chile, Universidad Católica, Cobreloa, Unión
Española, Palestino, Huachipato, Everton de Viña, Audax Italiano, O'Higgins,
Coquimbo Unido, Unión La Calera, Ñublense, Cobresal, Deportes Iquique,
La Serena, Antofagasta, Curicó Unido, Deportes Temuco, Magallanes,
Santiago Wanderers, Rangers de Talca, Deportes Concepción, Naval,
Fernández Vial, Deportes Copiapó, San Luis de Quillota, Unión San Felipe,
Deportes Melipilla, Santiago Morning, Barnechea, Deportes Recoleta,
Cobquecura*, Provincial Osorno, Deportes Valdivia, Puerto Montt,
Deportes Linares, Iberia, Lautaro de Buin, San Antonio Unido
> Históricos de Libertadores: Colo-Colo (título 1991), Cobreloa (2 finais), U. de Chile, U. Católica (final 1993), Unión Española (final 1975).

### Paraguai (PY) e Equador (EC) — segunda leva
- PY: Olimpia (3 títulos), Cerro Porteño, Libertad, Guaraní-PY, Nacional-PY (final 2014), Sportivo Luqueño, Sol de América…
- EC: LDU Quito (título 2008), Barcelona de Guayaquil (2 finais), Emelec, Independiente del Valle, Deportivo Quito, El Nacional…

## Prioridade Europa (Champions)

### Itália (IT)
Inter de Milão, Milan, Juventus, Napoli, Roma, Lazio, Atalanta, Fiorentina,
Bologna, Torino, Genoa, Sampdoria, Udinese, Sassuolo, Empoli, Verona,
Cagliari, Lecce, Parma, Como, Monza, Venezia, Palermo, Bari, Cremonese,
Spezia, Pisa, Frosinone, Salernitana, Brescia, Catanzaro, Modena, Reggiana,
Cesena, Sudtirol, Cittadella, Cosenza, Ternana, Ascoli, Perugia
> Históricos de Champions: Milan (7 títulos), Inter (3), Juventus (2), Roma, Napoli, Lazio, Atalanta, Fiorentina (final 1957), Torino, Sampdoria (final 1992).

### Holanda (NL)
Ajax, PSV, Feyenoord, AZ Alkmaar, Twente, Utrecht, Vitesse, Heerenveen,
Groningen, Sparta Rotterdam, NEC Nijmegen, Go Ahead Eagles, Fortuna
Sittard, Heracles, Willem II, PEC Zwolle, RKC Waalwijk, Almere City,
Excelsior, NAC Breda, Cambuur, De Graafschap, Roda JC, MVV Maastricht,
Emmen, Volendam, Telstar, Den Bosch, Eindhoven FC, TOP Oss, Helmond
Sport, Dordrecht, ADO Den Haag, Jong Ajax*, VVV-Venlo, Achilles '29,
Rijnsburgse Boys, Katwijk, Spakenburg, Quick Boys
> Históricos de Champions: Ajax (4 títulos), Feyenoord (1970), PSV (1988), Twente, AZ.

### Terceira leva possível
Escócia (Celtic, Rangers…), Bélgica (Club Brugge, Anderlecht…),
Turquia (Galatasaray, Fenerbahçe…), Grécia (Olympiacos, Panathinaikos…).

*Entradas marcadas com asterisco são preenchimento — trocar se houver nome melhor.

## Jogadores reais — plano

Hoje os nomes são gerados (`src/game/names.ts`). Para elencos reais:

1. Um arquivo por país (`data/elenco-<pais>.json`): `{ clubId: [ { name, pos, age } ] }` — força/valor continuam derivados do `baseBudget` do clube, então só precisamos de nome, posição e idade (~22 jogadores × 280 clubes ≈ 6.200 nomes).
2. Fazer por etapas, uma liga por vez (começar pelo Brasil), com o seeder usando o nome real quando existir e caindo no gerador quando não.
3. Sugestão: usar nomes de época livre (elencos clássicos) ou grafias levemente alteradas se quisermos evitar semelhança total com atletas atuais — decisão sua.
