/**
 * The trivia question bank.
 *
 * Trivia used to be five questions hardcoded inside aiGameMaster, behind a
 * comment admitting it ("In a real app we'd call the Gemini AI here, but for
 * this demo...") and a one-second sleep pretending to be a model. Five with no
 * memory of what had already been asked meant a room saw a repeat within a
 * couple of rounds.
 *
 * WRITING QUESTIONS FOR THIS BANK
 *
 * Answers here are *spoken* and graded by fuzzy match, which rules out a lot of
 * otherwise fine trivia:
 *
 *  - Keep answers to a word or three. "The Treaty of Versailles" is a sentence
 *    to say and a lottery to transcribe.
 *  - Give every form somebody might say in `accept`. A year is the usual trap:
 *    a recogniser hands back "1960" from one phone and "nineteen sixty" from
 *    the next, and only one of those matches a bare "1960".
 *  - Avoid answers that sound like other words, and anything whose spelling the
 *    recogniser has to guess at.
 *  - No multiple choice. There is nowhere to show the options and the whole
 *    round is someone shouting at a microphone.
 */

export type TriviaCategory =
  | 'general'
  | 'science'
  | 'geography'
  | 'history'
  | 'sport'
  | 'screen_and_song'
  | 'nigeria';

export type TriviaQuestion = {
  id: string;
  category: TriviaCategory;
  question: string;
  /** Shown at the reveal, so write it the way you would say it. */
  answer: string;
  /** Other spoken forms that should count. Matched case-insensitively. */
  accept?: string[];
  funFact?: string;
  difficulty: 'easy' | 'medium' | 'hard';
};

export const TRIVIA_CATEGORY_LABELS: Record<TriviaCategory, string> = {
  general: 'General Knowledge',
  science: 'Science & Nature',
  geography: 'Geography',
  history: 'History',
  sport: 'Sport',
  screen_and_song: 'Screen & Song',
  nigeria: 'Naija',
};

/**
 * Nigeria questions are deliberately the enduring kind — geography, history,
 * culture, records that do not move.
 *
 * Anything genuinely current belongs to the Gemini path, which can be asked at
 * the moment of play. A "current affairs" question baked into a file is out of
 * date the week after it is written, and wrong answers in a party game are
 * worse than no question.
 */
export const TRIVIA_BANK: TriviaQuestion[] = [
  // ── Naija ────────────────────────────────────────────────────────────────
  { id: 'ng1', category: 'nigeria', difficulty: 'easy', question: 'What is the capital city of Nigeria?', answer: 'Abuja', funFact: 'It replaced Lagos as the capital in 1991.' },
  { id: 'ng2', category: 'nigeria', difficulty: 'easy', question: 'Which city was the capital of Nigeria before Abuja?', answer: 'Lagos', funFact: 'Lagos is still the largest city and the commercial heart of the country.' },
  { id: 'ng3', category: 'nigeria', difficulty: 'easy', question: 'What is the currency of Nigeria?', answer: 'Naira', accept: ['the naira'], funFact: 'The naira replaced the Nigerian pound in 1973.' },
  { id: 'ng4', category: 'nigeria', difficulty: 'easy', question: 'In which year did Nigeria gain independence?', answer: '1960', accept: ['nineteen sixty', 'nineteen 60'], funFact: 'Independence Day is the first of October.' },
  { id: 'ng5', category: 'nigeria', difficulty: 'medium', question: 'How many states does Nigeria have?', answer: '36', accept: ['thirty six', 'thirty-six'], funFact: 'Thirty-six states plus the Federal Capital Territory.' },
  { id: 'ng6', category: 'nigeria', difficulty: 'easy', question: 'What is the longest river in Nigeria?', answer: 'Niger', accept: ['river niger', 'the niger'], funFact: 'The country takes its name from it.' },
  { id: 'ng7', category: 'nigeria', difficulty: 'medium', question: 'The Niger and Benue rivers meet at which city?', answer: 'Lokoja', funFact: 'The confluence is a famous landmark in Kogi State.' },
  { id: 'ng8', category: 'nigeria', difficulty: 'medium', question: 'Who was the first President of Nigeria?', answer: 'Nnamdi Azikiwe', accept: ['azikiwe', 'zik'], funFact: 'He was widely known as Zik of Africa.' },
  { id: 'ng9', category: 'nigeria', difficulty: 'medium', question: 'Which Nigerian won the Nobel Prize in Literature?', answer: 'Wole Soyinka', accept: ['soyinka'], funFact: 'He won in 1986, the first African laureate in Literature.' },
  { id: 'ng10', category: 'nigeria', difficulty: 'easy', question: 'Who wrote the novel Things Fall Apart?', answer: 'Chinua Achebe', accept: ['achebe'], funFact: 'It has been translated into more than fifty languages.' },
  { id: 'ng11', category: 'nigeria', difficulty: 'easy', question: 'What is the nickname of the Nigerian national football team?', answer: 'Super Eagles', accept: ['the super eagles'], funFact: 'The under-20 side are the Flying Eagles.' },
  { id: 'ng12', category: 'nigeria', difficulty: 'medium', question: 'At which Olympics did Nigeria win football gold?', answer: 'Atlanta', accept: ['atlanta 1996', '1996', 'nineteen ninety six'], funFact: 'Nigeria beat Argentina in the 1996 final.' },
  { id: 'ng13', category: 'nigeria', difficulty: 'easy', question: 'What is the popular name for the Nigerian film industry?', answer: 'Nollywood', funFact: 'It is one of the largest film industries in the world by output.' },
  { id: 'ng14', category: 'nigeria', difficulty: 'medium', question: 'Which large rock landmark stands near Abuja on the way from Suleja?', answer: 'Zuma Rock', accept: ['zuma'], funFact: 'It appeared on the hundred naira note for years.' },
  { id: 'ng15', category: 'nigeria', difficulty: 'easy', question: 'What are the two colours of the Nigerian flag?', answer: 'Green and white', accept: ['green white', 'white and green'], funFact: 'Green stands for the land, white for peace.' },
  { id: 'ng16', category: 'nigeria', difficulty: 'medium', question: 'Which ancient bronzes were taken from the Kingdom of Benin?', answer: 'Benin Bronzes', accept: ['the benin bronzes', 'benin brass'], funFact: 'Many are held in museums outside Nigeria and are the subject of restitution claims.' },
  { id: 'ng17', category: 'nigeria', difficulty: 'medium', question: 'Which Nigerian musician is called the father of Afrobeat?', answer: 'Fela Kuti', accept: ['fela', 'fela anikulapo kuti'], funFact: 'His Kalakuta Republic and the Shrine are Lagos legend.' },
  { id: 'ng18', category: 'nigeria', difficulty: 'medium', question: 'Which northern Nigerian city is famous for its ancient dye pits?', answer: 'Kano', funFact: 'The Kofar Mata pits have been in use for centuries.' },
  { id: 'ng19', category: 'nigeria', difficulty: 'hard', question: 'Which Nigerian sacred grove is a UNESCO World Heritage Site?', answer: 'Osun-Osogbo', accept: ['osun osogbo', 'osun sacred grove', 'osogbo'], funFact: 'The annual festival draws pilgrims from around the world.' },
  { id: 'ng20', category: 'nigeria', difficulty: 'medium', question: 'Which Nigerian city is the centre of the oil industry in the Niger Delta?', answer: 'Port Harcourt', accept: ['portharcourt', 'ph'], funFact: 'It is the capital of Rivers State.' },
  { id: 'ng21', category: 'nigeria', difficulty: 'hard', question: 'What is the highest mountain in Nigeria?', answer: 'Chappal Waddi', accept: ['chapal waddi'], funFact: 'It sits in Taraba State near the Cameroon border.' },
  { id: 'ng22', category: 'nigeria', difficulty: 'medium', question: 'Name any one of the three largest ethnic groups in Nigeria.', answer: 'Hausa', accept: ['yoruba', 'igbo', 'ibo', 'hausa fulani'], funFact: 'Hausa, Yoruba and Igbo are the three largest.' },

  // ── Geography ────────────────────────────────────────────────────────────
  { id: 'g1', category: 'geography', difficulty: 'easy', question: 'What is the largest continent in the world?', answer: 'Asia', funFact: 'It holds about sixty percent of the world population.' },
  { id: 'g2', category: 'geography', difficulty: 'easy', question: 'How many continents are there?', answer: 'Seven', accept: ['7'], funFact: 'Some countries teach six by joining the Americas.' },
  { id: 'g3', category: 'geography', difficulty: 'easy', question: 'What is the longest river in Africa?', answer: 'Nile', accept: ['the nile', 'river nile'], funFact: 'It runs through eleven countries.' },
  { id: 'g4', category: 'geography', difficulty: 'easy', question: 'What is the largest desert in Africa?', answer: 'Sahara', accept: ['the sahara'], funFact: 'It is roughly the size of the United States.' },
  { id: 'g5', category: 'geography', difficulty: 'medium', question: 'Which is the highest mountain in Africa?', answer: 'Kilimanjaro', accept: ['mount kilimanjaro'], funFact: 'It stands in Tanzania and can be climbed without ropes.' },
  { id: 'g6', category: 'geography', difficulty: 'easy', question: 'What is the capital of Kenya?', answer: 'Nairobi', funFact: 'It has a national park inside the city limits.' },
  { id: 'g7', category: 'geography', difficulty: 'medium', question: 'Which country has the most people in the world?', answer: 'India', funFact: 'India passed China in 2023.' },
  { id: 'g8', category: 'geography', difficulty: 'easy', question: 'Which ocean lies to the south of Nigeria?', answer: 'Atlantic', accept: ['the atlantic', 'atlantic ocean'], funFact: 'The Gulf of Guinea is part of it.' },
  { id: 'g9', category: 'geography', difficulty: 'medium', question: 'What is the smallest country in the world?', answer: 'Vatican City', accept: ['vatican', 'the vatican'], funFact: 'It covers less than half a square kilometre.' },
  { id: 'g10', category: 'geography', difficulty: 'medium', question: 'Which African country was never colonised?', answer: 'Ethiopia', funFact: 'It repelled an invasion at the Battle of Adwa in 1896.' },
  { id: 'g11', category: 'geography', difficulty: 'easy', question: 'What is the capital of Ghana?', answer: 'Accra', funFact: 'Ghana was the first sub-Saharan country to gain independence.' },
  { id: 'g12', category: 'geography', difficulty: 'hard', question: 'Which is the largest lake in Africa?', answer: 'Lake Victoria', accept: ['victoria'], funFact: 'It borders Uganda, Kenya and Tanzania.' },

  // ── Science & Nature ─────────────────────────────────────────────────────
  { id: 'sc1', category: 'science', difficulty: 'easy', question: 'What is the chemical symbol for water?', answer: 'H2O', accept: ['h two o', 'h 2 o'], funFact: 'Water covers about seventy-one percent of the Earth.' },
  { id: 'sc2', category: 'science', difficulty: 'easy', question: 'Which planet is known as the Red Planet?', answer: 'Mars', funFact: 'Its colour comes from iron oxide, which is rust.' },
  { id: 'sc3', category: 'science', difficulty: 'easy', question: 'What is the tallest mammal on Earth?', answer: 'Giraffe', accept: ['the giraffe'], funFact: 'A giraffe has the same number of neck bones as you do.' },
  { id: 'sc4', category: 'science', difficulty: 'easy', question: 'How many bones does an adult human have?', answer: '206', accept: ['two hundred and six', 'two hundred six'], funFact: 'A baby is born with about three hundred.' },
  { id: 'sc5', category: 'science', difficulty: 'easy', question: 'What gas do plants absorb from the air?', answer: 'Carbon dioxide', accept: ['co2', 'carbon dioxide gas'], funFact: 'They release oxygen as a by-product.' },
  { id: 'sc6', category: 'science', difficulty: 'medium', question: 'What is the largest animal on Earth?', answer: 'Blue whale', accept: ['the blue whale'], funFact: 'Its heart alone can weigh as much as a small car.' },
  { id: 'sc7', category: 'science', difficulty: 'medium', question: 'What is the hardest natural substance?', answer: 'Diamond', funFact: 'It is pure carbon under enormous pressure.' },
  { id: 'sc8', category: 'science', difficulty: 'easy', question: 'How many planets are in our solar system?', answer: 'Eight', accept: ['8'], funFact: 'Pluto was reclassified as a dwarf planet in 2006.' },
  { id: 'sc9', category: 'science', difficulty: 'medium', question: 'What organ pumps blood around the body?', answer: 'Heart', accept: ['the heart'], funFact: 'It beats roughly a hundred thousand times a day.' },
  { id: 'sc10', category: 'science', difficulty: 'medium', question: 'What is the closest star to Earth?', answer: 'The Sun', accept: ['sun'], funFact: 'Its light takes about eight minutes to reach us.' },
  { id: 'sc11', category: 'science', difficulty: 'hard', question: 'What does DNA stand for?', answer: 'Deoxyribonucleic acid', accept: ['deoxyribo nucleic acid'], funFact: 'Stretched out, the DNA in one cell is about two metres long.' },
  { id: 'sc12', category: 'science', difficulty: 'medium', question: 'Which blood cells fight infection?', answer: 'White blood cells', accept: ['white cells', 'leukocytes'], funFact: 'They make up about one percent of your blood.' },

  // ── History ──────────────────────────────────────────────────────────────
  { id: 'h1', category: 'history', difficulty: 'easy', question: 'Who was the first President of South Africa after apartheid?', answer: 'Nelson Mandela', accept: ['mandela', 'madiba'], funFact: 'He had spent twenty-seven years in prison.' },
  { id: 'h2', category: 'history', difficulty: 'medium', question: 'Which ancient civilisation built the pyramids at Giza?', answer: 'Egyptians', accept: ['ancient egyptians', 'egypt'], funFact: 'The Great Pyramid stood as the tallest structure on Earth for millennia.' },
  { id: 'h3', category: 'history', difficulty: 'medium', question: 'Which West African empire was famed for the wealth of Mansa Musa?', answer: 'Mali', accept: ['mali empire', 'the mali empire'], funFact: 'His pilgrimage to Mecca is said to have moved gold prices for years.' },
  { id: 'h4', category: 'history', difficulty: 'easy', question: 'In which year did the Second World War end?', answer: '1945', accept: ['nineteen forty five'], funFact: 'It had lasted six years.' },
  { id: 'h5', category: 'history', difficulty: 'medium', question: 'Who was the first person to walk on the moon?', answer: 'Neil Armstrong', accept: ['armstrong'], funFact: 'Buzz Aldrin followed him about twenty minutes later.' },
  { id: 'h6', category: 'history', difficulty: 'hard', question: 'Which kingdom was famous for its walled city and moat in what is now Edo State?', answer: 'Benin', accept: ['benin kingdom', 'kingdom of benin'], funFact: 'The Walls of Benin were among the largest earthworks ever built.' },
  { id: 'h7', category: 'history', difficulty: 'medium', question: 'Who led India to independence through non-violent protest?', answer: 'Gandhi', accept: ['mahatma gandhi'], funFact: 'India became independent in 1947.' },
  { id: 'h8', category: 'history', difficulty: 'medium', question: 'Which country gifted the Statue of Liberty to the United States?', answer: 'France', funFact: 'It arrived in crates and was assembled in New York.' },

  // ── Sport ────────────────────────────────────────────────────────────────
  { id: 'sp1', category: 'sport', difficulty: 'easy', question: 'How many players are on a football team on the pitch?', answer: 'Eleven', accept: ['11'], funFact: 'One of them has to be the goalkeeper.' },
  { id: 'sp2', category: 'sport', difficulty: 'easy', question: 'How often is the FIFA World Cup held?', answer: 'Every four years', accept: ['four years', 'every 4 years', '4 years'], funFact: 'The first was in 1930 in Uruguay.' },
  { id: 'sp3', category: 'sport', difficulty: 'medium', question: 'Which country has won the most FIFA World Cups?', answer: 'Brazil', funFact: 'Brazil is also the only country to play in every tournament.' },
  { id: 'sp4', category: 'sport', difficulty: 'medium', question: 'In which sport would you perform a slam dunk?', answer: 'Basketball', funFact: 'The hoop stands ten feet above the floor.' },
  { id: 'sp5', category: 'sport', difficulty: 'medium', question: 'How many rings are on the Olympic flag?', answer: 'Five', accept: ['5'], funFact: 'They stand for the five inhabited continents.' },
  { id: 'sp6', category: 'sport', difficulty: 'hard', question: 'Which Nigerian won an Olympic gold in the long jump in 1996?', answer: 'Chioma Ajunwa', accept: ['ajunwa'], funFact: 'She was the first Nigerian to win an individual Olympic gold.' },
  { id: 'sp7', category: 'sport', difficulty: 'medium', question: 'How many points is a try worth in rugby union?', answer: 'Five', accept: ['5', 'five points'], funFact: 'A conversion adds two more.' },

  // ── Screen & Song ────────────────────────────────────────────────────────
  { id: 'm1', category: 'screen_and_song', difficulty: 'easy', question: 'How many strings does a standard guitar have?', answer: 'Six', accept: ['6'], funFact: 'A bass guitar usually has four.' },
  { id: 'm2', category: 'screen_and_song', difficulty: 'easy', question: 'Which instrument has black and white keys?', answer: 'Piano', accept: ['the piano', 'keyboard'], funFact: 'A full piano has eighty-eight keys.' },
  { id: 'm3', category: 'screen_and_song', difficulty: 'medium', question: 'What music genre did Fela Kuti pioneer?', answer: 'Afrobeat', funFact: 'It fuses highlife, jazz and Yoruba rhythms.' },
  { id: 'm4', category: 'screen_and_song', difficulty: 'medium', question: 'Which Jamaican genre is Bob Marley most associated with?', answer: 'Reggae', funFact: 'He was born in Nine Mile, Saint Ann.' },
  { id: 'm5', category: 'screen_and_song', difficulty: 'easy', question: 'How many notes are in a musical octave?', answer: 'Eight', accept: ['8'], funFact: 'Octave comes from the Latin for eighth.' },
  { id: 'm6', category: 'screen_and_song', difficulty: 'medium', question: 'What is the highest female singing voice called?', answer: 'Soprano', funFact: 'The lowest male voice is the bass.' },

  // ── General ──────────────────────────────────────────────────────────────
  { id: 'gk1', category: 'general', difficulty: 'easy', question: 'How many days are in a leap year?', answer: '366', accept: ['three hundred and sixty six', 'three hundred sixty six'], funFact: 'The extra day is the twenty-ninth of February.' },
  { id: 'gk2', category: 'general', difficulty: 'easy', question: 'How many sides does a hexagon have?', answer: 'Six', accept: ['6'], funFact: 'Honeycomb cells are hexagonal because it wastes the least wax.' },
  { id: 'gk3', category: 'general', difficulty: 'easy', question: 'What colour do you get mixing blue and yellow?', answer: 'Green', funFact: 'Blue and yellow are both primary colours in paint.' },
  { id: 'gk4', category: 'general', difficulty: 'easy', question: 'How many minutes are in a full day?', answer: '1440', accept: ['one thousand four hundred and forty', 'fourteen forty'], funFact: 'That is twenty-four times sixty.' },
  { id: 'gk5', category: 'general', difficulty: 'medium', question: 'What is the most spoken language in the world by number of speakers?', answer: 'English', funFact: 'Counting native speakers only, Mandarin Chinese leads.' },
  { id: 'gk6', category: 'general', difficulty: 'easy', question: 'How many letters are in the English alphabet?', answer: '26', accept: ['twenty six', 'twenty-six'], funFact: 'Five of them are vowels.' },
  { id: 'gk7', category: 'general', difficulty: 'medium', question: 'What do you call a group of lions?', answer: 'Pride', accept: ['a pride'], funFact: 'A group of crows is called a murder.' },
  { id: 'gk8', category: 'general', difficulty: 'medium', question: 'How many squares are on a chessboard?', answer: '64', accept: ['sixty four', 'sixty-four'], funFact: 'Eight rows of eight.' },
];

/** Every form of an answer that should be accepted, lowercased. */
export function acceptedAnswers(q: TriviaQuestion): string[] {
  return [q.answer, ...(q.accept ?? [])].map((a) => a.toLowerCase().trim()).filter(Boolean);
}

/**
 * Picks a question the room has not just had.
 *
 * The old picker was a bare random index into five questions, so a repeat was a
 * one-in-five event on every single round and rooms saw the same question twice
 * in a sitting. Anything in `recentIds` is skipped, and the rule relaxes rather
 * than failing when the bank runs dry.
 */
export function pickTriviaQuestion(
  recentIds: string[] = [],
  categories?: TriviaCategory[]
): TriviaQuestion {
  const inCategory = categories?.length
    ? TRIVIA_BANK.filter((q) => categories.includes(q.category))
    : TRIVIA_BANK;
  const pool = inCategory.length > 0 ? inCategory : TRIVIA_BANK;

  const unseen = pool.filter((q) => !recentIds.includes(q.id));
  const choices = unseen.length > 0 ? unseen : pool;
  return choices[Math.floor(Math.random() * choices.length)];
}

/** How many past questions to remember. Roughly a long session's worth. */
export const TRIVIA_HISTORY_WINDOW = 40;

export function rememberTrivia(recent: string[] | undefined, id: string): string[] {
  return [...(recent ?? []), id].slice(-TRIVIA_HISTORY_WINDOW);
}
