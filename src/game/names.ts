import type { Rng } from "./rng";
import { pick } from "./rng";

const POOLS: Record<string, { first: string[]; last: string[] }> = {
  BR: {
    first: ["João", "Pedro", "Lucas", "Gabriel", "Matheus", "Rafael", "Thiago", "Bruno", "Diego", "Felipe", "Caio", "Vinícius", "Éder", "Renan", "Wesley", "Talles", "Kaio", "Igor", "Alan", "Everton"],
    last: ["Silva", "Santos", "Oliveira", "Souza", "Pereira", "Costa", "Ribeiro", "Almeida", "Nascimento", "Lima", "Araújo", "Ferreira", "Barbosa", "Rocha", "Dias", "Moraes", "Cardoso", "Teixeira", "Farias", "Pinto"],
  },
  AR: {
    first: ["Juan", "Lautaro", "Nicolás", "Emiliano", "Gonzalo", "Ángel", "Julián", "Enzo", "Alexis", "Rodrigo", "Franco", "Matías", "Lucas", "Thiago", "Ezequiel", "Marcos", "Leandro", "Facundo", "Nahuel", "Agustín"],
    last: ["González", "Rodríguez", "Fernández", "López", "Martínez", "Díaz", "Pérez", "Romero", "Sosa", "Álvarez", "Torres", "Ruiz", "Acuña", "Molina", "Paredes", "Correa", "Palacios", "Montiel", "Quintero", "Herrera"],
  },
  EN: {
    first: ["Harry", "Jack", "Jude", "Phil", "Marcus", "Declan", "Bukayo", "Ollie", "Reece", "Trent", "Callum", "Mason", "James", "Aaron", "Conor", "Kyle", "Ben", "Luke", "Cole", "Jarrod"],
    last: ["Smith", "Jones", "Taylor", "Brown", "Williams", "Wilson", "Johnson", "Walker", "White", "Thompson", "Robinson", "Wright", "Hughes", "Edwards", "Green", "Hall", "Clarke", "Palmer", "Foster", "Barnes"],
  },
  ES: {
    first: ["Pablo", "Álvaro", "Dani", "Mikel", "Rodri", "Ferran", "Nico", "Pedri", "Iker", "Sergio", "Marco", "Unai", "Aitor", "Borja", "Iñaki", "Raúl", "Adrián", "Hugo", "Javi", "Carlos"],
    last: ["García", "Fernández", "López", "Martín", "Sánchez", "Pérez", "Gómez", "Navarro", "Torres", "Moreno", "Jiménez", "Ruiz", "Alonso", "Vázquez", "Serrano", "Molina", "Ortega", "Delgado", "Iglesias", "Campos"],
  },
  DE: {
    first: ["Lukas", "Leon", "Florian", "Jamal", "Niclas", "Jonas", "Kai", "Timo", "Nico", "Maximilian", "Julian", "Robin", "Pascal", "Tim", "Felix", "David", "Moritz", "Finn", "Jan", "Marco"],
    last: ["Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Wagner", "Becker", "Hoffmann", "Schulz", "Koch", "Richter", "Klein", "Wolf", "Neumann", "Braun", "Krüger", "Lehmann", "Schäfer", "Vogel", "Brandt"],
  },
  FR: {
    first: ["Kylian", "Antoine", "Ousmane", "Aurélien", "Eduardo", "Théo", "Jules", "Hugo", "Lucas", "Adrien", "Randal", "Bradley", "Warren", "Malo", "Mathis", "Léo", "Enzo", "Nathan", "Rayan", "Amine"],
    last: ["Martin", "Bernard", "Dubois", "Thomas", "Robert", "Petit", "Durand", "Leroy", "Moreau", "Simon", "Laurent", "Lefebvre", "Roux", "Fournier", "Girard", "Mendy", "Diallo", "Traoré", "Koné", "Camara"],
  },
  PT: {
    first: ["Gonçalo", "Diogo", "Rúben", "Bernardo", "Vitinha", "Nuno", "Rafael", "Francisco", "Tiago", "André", "Pedro", "Ricardo", "Fábio", "Tomás", "Duarte", "Afonso", "Miguel", "Renato", "Hélder", "Paulo"],
    last: ["Silva", "Santos", "Ferreira", "Costa", "Pereira", "Carvalho", "Fernandes", "Gonçalves", "Rodrigues", "Martins", "Sousa", "Gomes", "Lopes", "Marques", "Alves", "Ramos", "Neves", "Leão", "Semedo", "Mendes"],
  },
  IT: {
    first: ["Alessandro", "Lorenzo", "Federico", "Nicolò", "Davide", "Matteo", "Gianluigi", "Sandro", "Giacomo", "Riccardo", "Andrea", "Marco", "Giovanni", "Antonio", "Francesco", "Luca", "Stefano", "Domenico", "Ciro", "Salvatore"],
    last: ["Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "Romano", "Colombo", "Ricci", "Marino", "Greco", "Bruno", "Gallo", "Conti", "De Luca", "Mancini", "Costa", "Giordano", "Rizzo", "Lombardi", "Barella"],
  },
};

export function playerName(rng: Rng, country: string): string {
  const pool = POOLS[country] ?? POOLS.BR;
  return `${pick(rng, pool.first)} ${pick(rng, pool.last)}`;
}
