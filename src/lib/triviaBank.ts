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
  { id: 'ng16', category: 'nigeria', difficulty: 'medium', question: 'Which famous metal sculptures did British troops loot from a West African kingdom in 1897?', answer: 'Benin Bronzes', accept: ['the benin bronzes', 'benin brass'], funFact: 'Many are held in museums outside Nigeria and are the subject of restitution claims.' },
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
  { id: 'ng23', category: 'nigeria', difficulty: 'easy', question: 'Which Nigerian state is nicknamed the Coal City State?', answer: 'Enugu', funFact: 'Coal was found at Enugu in 1909, and the city grew up around the mines.' },
  { id: 'ng24', category: 'nigeria', difficulty: 'easy', question: 'Which state is known as the Food Basket of the Nation?', answer: 'Benue' },
  { id: 'ng25', category: 'nigeria', difficulty: 'medium', question: 'Which state calls itself the Pace Setter State?', answer: 'Oyo' },
  { id: 'ng26', category: 'nigeria', difficulty: 'medium', question: 'Which state is known as the Gateway State?', answer: 'Ogun' },
  { id: 'ng27', category: 'nigeria', difficulty: 'medium', question: 'Which state is nicknamed the Sunshine State?', answer: 'Ondo' },
  { id: 'ng28', category: 'nigeria', difficulty: 'medium', question: 'Which state is called the Confluence State, where two great rivers meet?', answer: 'Kogi', funFact: 'The Niger and the Benue meet at Lokoja, its capital.' },
  { id: 'ng29', category: 'nigeria', difficulty: 'medium', question: 'Which state calls itself the Light of the Nation?', answer: 'Anambra' },
  { id: 'ng30', category: 'nigeria', difficulty: 'medium', question: 'Which state is known as God\'s Own State?', answer: 'Abia' },
  { id: 'ng31', category: 'nigeria', difficulty: 'medium', question: 'Which state is called the Home of Peace and Tourism?', answer: 'Plateau' },
  { id: 'ng32', category: 'nigeria', difficulty: 'medium', question: 'Which state is known as the State of Harmony?', answer: 'Kwara' },
  { id: 'ng33', category: 'nigeria', difficulty: 'hard', question: 'Which state is nicknamed the Power State, for its hydroelectric dams?', answer: 'Niger', accept: ['niger state'] },
  { id: 'ng34', category: 'nigeria', difficulty: 'medium', question: 'Which state is called the Treasure Base of the Nation?', answer: 'Rivers', accept: ['rivers state'] },
  { id: 'ng35', category: 'nigeria', difficulty: 'medium', question: 'Which state is known as the Centre of Excellence?', answer: 'Lagos', accept: ['lagos state'] },
  { id: 'ng36', category: 'nigeria', difficulty: 'easy', question: 'What is the capital of Oyo State?', answer: 'Ibadan' },
  { id: 'ng37', category: 'nigeria', difficulty: 'easy', question: 'What is the capital of Kwara State?', answer: 'Ilorin' },
  { id: 'ng38', category: 'nigeria', difficulty: 'easy', question: 'What is the capital of Cross River State?', answer: 'Calabar' },
  { id: 'ng39', category: 'nigeria', difficulty: 'easy', question: 'What is the capital of Plateau State?', answer: 'Jos' },
  { id: 'ng40', category: 'nigeria', difficulty: 'medium', question: 'What is the capital of Akwa Ibom State?', answer: 'Uyo' },
  { id: 'ng41', category: 'nigeria', difficulty: 'medium', question: 'What is the capital of Imo State?', answer: 'Owerri' },
  { id: 'ng42', category: 'nigeria', difficulty: 'medium', question: 'What is the capital of Delta State?', answer: 'Asaba' },
  { id: 'ng43', category: 'nigeria', difficulty: 'medium', question: 'What is the capital of Ondo State?', answer: 'Akure' },
  { id: 'ng44', category: 'nigeria', difficulty: 'medium', question: 'What is the capital of Niger State?', answer: 'Minna' },
  { id: 'ng45', category: 'nigeria', difficulty: 'medium', question: 'What is the capital of Adamawa State?', answer: 'Yola' },
  { id: 'ng46', category: 'nigeria', difficulty: 'medium', question: 'What is the capital of Lagos State?', answer: 'Ikeja', funFact: 'Not Lagos Island — the state capital is on the mainland.' },
  { id: 'ng47', category: 'nigeria', difficulty: 'medium', question: 'What is the capital of Ogun State?', answer: 'Abeokuta' },
  { id: 'ng48', category: 'nigeria', difficulty: 'medium', question: 'What is the capital of Benue State?', answer: 'Makurdi' },
  { id: 'ng49', category: 'nigeria', difficulty: 'medium', question: 'What is the capital of Borno State?', answer: 'Maiduguri' },
  { id: 'ng50', category: 'nigeria', difficulty: 'easy', question: 'What is the capital of Edo State?', answer: 'Benin City', accept: ['benin'] },
  { id: 'ng51', category: 'nigeria', difficulty: 'medium', question: 'What is the capital of Osun State?', answer: 'Osogbo', accept: ['oshogbo'] },
  { id: 'ng52', category: 'nigeria', difficulty: 'hard', question: 'What is the capital of Anambra State?', answer: 'Awka' },
  { id: 'ng53', category: 'nigeria', difficulty: 'hard', question: 'What is the capital of Nasarawa State?', answer: 'Lafia' },
  { id: 'ng54', category: 'nigeria', difficulty: 'medium', question: 'In which year did Nigeria become a republic?', answer: '1963', accept: ['nineteen sixty three', 'nineteen 63'], funFact: 'Three years after independence, on the first of October.' },
  { id: 'ng55', category: 'nigeria', difficulty: 'medium', question: 'Who was Nigeria\'s first and only Prime Minister?', answer: 'Tafawa Balewa', accept: ['abubakar tafawa balewa', 'balewa'] },
  { id: 'ng56', category: 'nigeria', difficulty: 'medium', question: 'In which year did Abuja officially become the capital of Nigeria?', answer: '1991', accept: ['nineteen ninety one', 'nineteen 91'], funFact: 'The move from Lagos became official in December 1991.' },
  { id: 'ng57', category: 'nigeria', difficulty: 'hard', question: 'Who designed the Nigerian flag?', answer: 'Taiwo Akinkunmi', accept: ['akinkunmi', 'michael taiwo akinkunmi'], funFact: 'He was a student in London when he entered the competition in 1958.' },
  { id: 'ng58', category: 'nigeria', difficulty: 'easy', question: 'In which year did the Nigerian Civil War end?', answer: '1970', accept: ['nineteen seventy', 'nineteen 70'] },
  { id: 'ng59', category: 'nigeria', difficulty: 'medium', question: 'In which year did the Nigerian Civil War begin?', answer: '1967', accept: ['nineteen sixty seven', 'nineteen 67'] },
  { id: 'ng60', category: 'nigeria', difficulty: 'easy', question: 'What was the name of the state that tried to break away, starting the Civil War?', answer: 'Biafra' },
  { id: 'ng61', category: 'nigeria', difficulty: 'medium', question: 'Who led the Abeokuta Women\'s Revolt against unfair taxes in the 1940s?', answer: 'Funmilayo Ransome-Kuti', accept: ['funmilayo ransome kuti', 'funmilayo', 'ransome kuti'], funFact: 'She was also the mother of Fela Kuti.' },
  { id: 'ng62', category: 'nigeria', difficulty: 'medium', question: 'Which British governor joined Northern and Southern Nigeria together in 1914?', answer: 'Lord Lugard', accept: ['lugard', 'frederick lugard'] },
  { id: 'ng63', category: 'nigeria', difficulty: 'easy', question: 'In which year were Northern and Southern Nigeria joined into one country?', answer: '1914', accept: ['nineteen fourteen', 'nineteen 14'] },
  { id: 'ng64', category: 'nigeria', difficulty: 'hard', question: 'Which journalist first suggested the name Nigeria?', answer: 'Flora Shaw', accept: ['lady lugard'], funFact: 'She coined it in 1897, from the River Niger. She later married Lord Lugard.' },
  { id: 'ng65', category: 'nigeria', difficulty: 'medium', question: 'In which year was the naira introduced?', answer: '1973', accept: ['nineteen seventy three', 'nineteen 73'] },
  { id: 'ng66', category: 'nigeria', difficulty: 'hard', question: 'Which currency did the naira replace?', answer: 'The pound', accept: ['pound', 'nigerian pound', 'pounds'] },
  { id: 'ng67', category: 'nigeria', difficulty: 'hard', question: 'Who was Nigeria\'s first military head of state?', answer: 'Aguiyi-Ironsi', accept: ['aguiyi ironsi', 'ironsi', 'johnson aguiyi ironsi'] },
  { id: 'ng68', category: 'nigeria', difficulty: 'medium', question: 'Which head of state split Nigeria into twelve states in 1967?', answer: 'Yakubu Gowon', accept: ['gowon'] },
  { id: 'ng69', category: 'nigeria', difficulty: 'medium', question: 'Which Nigerian head of state was killed in a coup attempt in 1976?', answer: 'Murtala Mohammed', accept: ['murtala', 'murtala muhammed', 'murtala muhammad'], funFact: 'The main Lagos airport is named after him.' },
  { id: 'ng70', category: 'nigeria', difficulty: 'medium', question: 'Who was Nigeria\'s first executive President, elected in 1979?', answer: 'Shehu Shagari', accept: ['shagari'] },
  { id: 'ng71', category: 'nigeria', difficulty: 'medium', question: 'Who was the widely presumed winner of the annulled June 12, 1993 election?', answer: 'MKO Abiola', accept: ['abiola', 'moshood abiola', 'm k o abiola'], funFact: 'June 12 became Democracy Day in his honour.' },
  { id: 'ng72', category: 'nigeria', difficulty: 'medium', question: 'Which Nigerian became the first woman to lead the World Trade Organization?', answer: 'Ngozi Okonjo-Iweala', accept: ['okonjo iweala', 'ngozi okonjo iweala', 'ngozi'], funFact: 'She took office in 2021, also the first African in the role.' },
  { id: 'ng73', category: 'nigeria', difficulty: 'easy', question: 'On what date is Nigeria\'s Independence Day?', answer: 'October 1', accept: ['october first', 'first of october', '1st of october', '1 october', 'october 1st'] },
  { id: 'ng74', category: 'nigeria', difficulty: 'medium', question: 'On what date is Democracy Day celebrated in Nigeria?', answer: 'June 12', accept: ['june twelfth', 'twelfth of june', '12th of june', '12 june', 'june 12th'] },
  { id: 'ng75', category: 'nigeria', difficulty: 'medium', question: 'Which bird sits on top of Nigeria\'s coat of arms?', answer: 'Eagle', accept: ['an eagle', 'red eagle', 'the eagle'], funFact: 'The eagle is red and stands for strength.' },
  { id: 'ng76', category: 'nigeria', difficulty: 'medium', question: 'Which animals hold up the shield on Nigeria\'s coat of arms?', answer: 'Horses', accept: ['horse', 'white horses', 'two horses'] },
  { id: 'ng77', category: 'nigeria', difficulty: 'hard', question: 'The white Y on Nigeria\'s coat of arms stands for which two rivers?', answer: 'Niger and Benue', accept: ['benue and niger', 'the niger and the benue'] },
  { id: 'ng78', category: 'nigeria', difficulty: 'easy', question: 'How many geopolitical zones does Nigeria have?', answer: 'Six', accept: ['6'] },
  { id: 'ng79', category: 'nigeria', difficulty: 'hard', question: 'How many local government areas does Nigeria have?', answer: '774', accept: ['seven hundred and seventy four', 'seven hundred seventy four', 'seven seventy four'] },
  { id: 'ng80', category: 'nigeria', difficulty: 'medium', question: 'Which shrinking lake in the far north-east does Nigeria share with three of its neighbours?', answer: 'Lake Chad', accept: ['chad'], funFact: 'It has shrunk by around ninety percent since the 1960s.' },
  { id: 'ng81', category: 'nigeria', difficulty: 'medium', question: 'Which country shares the longest border with Nigeria?', answer: 'Cameroon' },
  { id: 'ng82', category: 'nigeria', difficulty: 'easy', question: 'Which country borders Nigeria to the west?', answer: 'Benin', accept: ['republic of benin', 'benin republic'] },
  { id: 'ng83', category: 'nigeria', difficulty: 'easy', question: 'Which country borders Nigeria to the north?', answer: 'Niger', accept: ['niger republic', 'republic of niger'] },
  { id: 'ng84', category: 'nigeria', difficulty: 'easy', question: 'Which is the largest state in Nigeria by land area?', answer: 'Niger', accept: ['niger state'] },
  { id: 'ng85', category: 'nigeria', difficulty: 'easy', question: 'Which is the smallest state in Nigeria by land area?', answer: 'Lagos', accept: ['lagos state'], funFact: 'Also one of the most crowded.' },
  { id: 'ng86', category: 'nigeria', difficulty: 'medium', question: 'Obudu Mountain Resort is in which state?', answer: 'Cross River', accept: ['cross river state'] },
  { id: 'ng87', category: 'nigeria', difficulty: 'medium', question: 'Yankari Game Reserve is in which state?', answer: 'Bauchi', accept: ['bauchi state'], funFact: 'It is famous for its warm Wikki springs.' },
  { id: 'ng88', category: 'nigeria', difficulty: 'hard', question: 'The Erin Ijesha waterfall is in which state?', answer: 'Osun', accept: ['osun state'] },
  { id: 'ng89', category: 'nigeria', difficulty: 'medium', question: 'Nigeria\'s first university was founded in 1948 in which city?', answer: 'Ibadan', funFact: 'It began as University College Ibadan.' },
  { id: 'ng90', category: 'nigeria', difficulty: 'medium', question: 'Obafemi Awolowo University is in which town?', answer: 'Ile-Ife', accept: ['ile ife', 'ife'] },
  { id: 'ng91', category: 'nigeria', difficulty: 'medium', question: 'The University of Nigeria is in which town, giving it the initials UNN?', answer: 'Nsukka' },
  { id: 'ng92', category: 'nigeria', difficulty: 'medium', question: 'The Argungu Fishing Festival is held in which state?', answer: 'Kebbi', accept: ['kebbi state'] },
  { id: 'ng93', category: 'nigeria', difficulty: 'medium', question: 'The Eyo festival, with its masquerades in white, belongs to which city?', answer: 'Lagos' },
  { id: 'ng94', category: 'nigeria', difficulty: 'medium', question: 'In which month is the Calabar Carnival held?', answer: 'December' },
  { id: 'ng95', category: 'nigeria', difficulty: 'easy', question: 'Which Nigerian soup is made from ground melon seeds?', answer: 'Egusi' },
  { id: 'ng96', category: 'nigeria', difficulty: 'easy', question: 'What are the fried bean cakes Nigerians eat at breakfast called?', answer: 'Akara' },
  { id: 'ng97', category: 'nigeria', difficulty: 'easy', question: 'Which rice dish is at the centre of a friendly rivalry between Nigeria and Ghana?', answer: 'Jollof', accept: ['jollof rice'] },
  { id: 'ng98', category: 'nigeria', difficulty: 'easy', question: 'What is dodo made from?', answer: 'Plantain', accept: ['plantains', 'fried plantain'] },
  { id: 'ng99', category: 'nigeria', difficulty: 'easy', question: 'What is the spicy grilled meat sold at roadside stands, especially in the North?', answer: 'Suya' },
  { id: 'ng100', category: 'nigeria', difficulty: 'hard', question: 'Which bird is often named as Nigeria\'s national bird?', answer: 'Black crowned crane', accept: ['crowned crane', 'the black crowned crane'] },
  { id: 'ng101', category: 'nigeria', difficulty: 'easy', question: 'Who wrote the novel Half of a Yellow Sun?', answer: 'Chimamanda Adichie', accept: ['chimamanda ngozi adichie', 'adichie', 'chimamanda'] },
  { id: 'ng102', category: 'nigeria', difficulty: 'hard', question: 'Which Nigerian novelist won the Booker Prize for The Famished Road?', answer: 'Ben Okri', accept: ['okri'], funFact: 'He won it in 1991, aged thirty-two.' },
  { id: 'ng103', category: 'nigeria', difficulty: 'medium', question: 'Who wrote the play Death and the King\'s Horseman?', answer: 'Wole Soyinka', accept: ['soyinka'] },
  { id: 'ng104', category: 'nigeria', difficulty: 'hard', question: 'Who wrote the novel The Joys of Motherhood?', answer: 'Buchi Emecheta', accept: ['emecheta'] },
  { id: 'ng105', category: 'nigeria', difficulty: 'medium', question: 'Which 1992 film is often credited with launching Nollywood?', answer: 'Living in Bondage' },
  { id: 'ng106', category: 'nigeria', difficulty: 'easy', question: 'Which Nigerian star released the album Made in Lagos?', answer: 'Wizkid', accept: ['wiz kid'] },
  { id: 'ng107', category: 'nigeria', difficulty: 'medium', question: 'Which Nigerian artist won the Grammy for Best Global Music Album in 2021?', answer: 'Burna Boy', accept: ['burna'], funFact: 'The album was Twice as Tall.' },
  { id: 'ng108', category: 'nigeria', difficulty: 'easy', question: 'Which Nigerian singer had a worldwide hit with Calm Down?', answer: 'Rema' },
  { id: 'ng109', category: 'nigeria', difficulty: 'easy', question: 'What is the real first name of the singer Davido?', answer: 'David' },
  { id: 'ng110', category: 'nigeria', difficulty: 'medium', question: 'Which Nigerian singer released African Queen in 2004?', answer: '2Baba', accept: ['2face', 'tuface', 'two face', '2 face', 'tubaba', 'two baba', '2 baba', '2face idibia'] },
  { id: 'ng111', category: 'nigeria', difficulty: 'medium', question: 'King Sunny Ade is a legend of which Nigerian music style?', answer: 'Juju', accept: ['juju music'] },
  { id: 'ng112', category: 'nigeria', difficulty: 'hard', question: 'Which music style is Sikiru Ayinde Barrister credited with creating?', answer: 'Fuji', accept: ['fuji music'] },
  { id: 'ng113', category: 'nigeria', difficulty: 'medium', question: 'Who sang the highlife classic Sweet Mother?', answer: 'Prince Nico Mbarga', accept: ['nico mbarga', 'mbarga'] },
  { id: 'ng114', category: 'nigeria', difficulty: 'easy', question: 'What is the nickname of Nigeria\'s women\'s national football team?', answer: 'Super Falcons', accept: ['the super falcons'] },
  { id: 'ng115', category: 'nigeria', difficulty: 'medium', question: 'What is the nickname of Nigeria\'s under-17 football team?', answer: 'Golden Eaglets', accept: ['the golden eaglets'] },
  { id: 'ng116', category: 'nigeria', difficulty: 'medium', question: 'What is the nickname of Nigeria\'s national basketball team?', answer: 'D\'Tigers', accept: ['the tigers', 'tigers', 'd tigers'] },
  { id: 'ng117', category: 'nigeria', difficulty: 'easy', question: 'What was the famous nickname of Nigerian footballer Austin Okocha?', answer: 'Jay-Jay', accept: ['jay jay', 'jj'] },
  { id: 'ng118', category: 'nigeria', difficulty: 'medium', question: 'Which Nigerian striker was nicknamed Papilo?', answer: 'Nwankwo Kanu', accept: ['kanu'] },
  { id: 'ng119', category: 'nigeria', difficulty: 'medium', question: 'In which year did Nigeria win its first Africa Cup of Nations?', answer: '1980', accept: ['nineteen eighty', 'nineteen 80'], funFact: 'Nigeria hosted that tournament too.' },
  { id: 'ng120', category: 'nigeria', difficulty: 'medium', question: 'Which Lagos-born basketball legend was nicknamed The Dream?', answer: 'Hakeem Olajuwon', accept: ['olajuwon', 'hakeem'] },
  { id: 'ng121', category: 'nigeria', difficulty: 'medium', question: 'Which Nigerian won the world title in the 100 metres hurdles in 2022?', answer: 'Tobi Amusan', accept: ['amusan'] },
  { id: 'g13', category: 'geography', difficulty: 'easy', question: 'What is the capital of Japan?', answer: 'Tokyo' },
  { id: 'g14', category: 'geography', difficulty: 'easy', question: 'What is the capital of Egypt?', answer: 'Cairo' },
  { id: 'g15', category: 'geography', difficulty: 'medium', question: 'What is the executive capital of South Africa?', answer: 'Pretoria', funFact: 'South Africa has three capitals: Pretoria, Cape Town and Bloemfontein.' },
  { id: 'g16', category: 'geography', difficulty: 'medium', question: 'What is the capital of Canada?', answer: 'Ottawa', funFact: 'Not Toronto, which is the biggest city.' },
  { id: 'g17', category: 'geography', difficulty: 'medium', question: 'What is the capital of Australia?', answer: 'Canberra', funFact: 'It was built as a compromise between Sydney and Melbourne.' },
  { id: 'g18', category: 'geography', difficulty: 'medium', question: 'What is the capital of Brazil?', answer: 'Brasilia' },
  { id: 'g19', category: 'geography', difficulty: 'easy', question: 'What is the capital of Senegal?', answer: 'Dakar' },
  { id: 'g20', category: 'geography', difficulty: 'medium', question: 'What is the capital of Ethiopia?', answer: 'Addis Ababa', accept: ['addis'], funFact: 'The African Union has its headquarters there.' },
  { id: 'g21', category: 'geography', difficulty: 'medium', question: 'What is the capital of Morocco?', answer: 'Rabat', funFact: 'Not Casablanca or Marrakesh.' },
  { id: 'g22', category: 'geography', difficulty: 'medium', question: 'What is the capital of Cameroon?', answer: 'Yaounde' },
  { id: 'g23', category: 'geography', difficulty: 'medium', question: 'What is the capital of Turkey?', answer: 'Ankara', funFact: 'Not Istanbul, which is far larger.' },
  { id: 'g24', category: 'geography', difficulty: 'easy', question: 'What is the capital of Argentina?', answer: 'Buenos Aires' },
  { id: 'g25', category: 'geography', difficulty: 'easy', question: 'What is the capital of Spain?', answer: 'Madrid' },
  { id: 'g26', category: 'geography', difficulty: 'easy', question: 'What is the capital of the United States?', answer: 'Washington', accept: ['washington dc', 'washington d c'] },
  { id: 'g27', category: 'geography', difficulty: 'medium', question: 'Kigali is the capital of which country?', answer: 'Rwanda' },
  { id: 'g28', category: 'geography', difficulty: 'medium', question: 'Lusaka is the capital of which country?', answer: 'Zambia' },
  { id: 'g29', category: 'geography', difficulty: 'easy', question: 'What is the largest ocean on Earth?', answer: 'Pacific', accept: ['pacific ocean', 'the pacific'] },
  { id: 'g30', category: 'geography', difficulty: 'easy', question: 'What is the tallest mountain in the world?', answer: 'Everest', accept: ['mount everest'] },
  { id: 'g31', category: 'geography', difficulty: 'easy', question: 'What is the largest country in the world by area?', answer: 'Russia' },
  { id: 'g32', category: 'geography', difficulty: 'medium', question: 'What is the largest country in Africa by area?', answer: 'Algeria', funFact: 'Sudan held the title until South Sudan split away in 2011.' },
  { id: 'g33', category: 'geography', difficulty: 'easy', question: 'Which is the most populous country in Africa?', answer: 'Nigeria' },
  { id: 'g34', category: 'geography', difficulty: 'hard', question: 'Which country has more pyramids than Egypt?', answer: 'Sudan', funFact: 'Sudan has around two hundred, mostly built by the kings of Kush.' },
  { id: 'g35', category: 'geography', difficulty: 'hard', question: 'Which country has the most time zones?', answer: 'France', funFact: 'Twelve, thanks to its overseas territories.' },
  { id: 'g36', category: 'geography', difficulty: 'medium', question: 'What is the largest island in the world?', answer: 'Greenland', funFact: 'Australia is counted as a continent, not an island.' },
  { id: 'g37', category: 'geography', difficulty: 'hard', question: 'Which river flows through Baghdad?', answer: 'Tigris', accept: ['the tigris'] },
  { id: 'g38', category: 'geography', difficulty: 'easy', question: 'Which river flows through London?', answer: 'Thames', accept: ['the thames', 'river thames'] },
  { id: 'g39', category: 'geography', difficulty: 'easy', question: 'Which European country is shaped like a boot?', answer: 'Italy' },
  { id: 'g40', category: 'geography', difficulty: 'medium', question: 'Which narrow strait separates Africa from Europe?', answer: 'Gibraltar', accept: ['strait of gibraltar', 'straits of gibraltar'] },
  { id: 'g41', category: 'geography', difficulty: 'medium', question: 'The ancient city of Timbuktu is in which country?', answer: 'Mali' },
  { id: 'g42', category: 'geography', difficulty: 'medium', question: 'Mount Kilimanjaro is in which country?', answer: 'Tanzania' },
  { id: 'g43', category: 'geography', difficulty: 'medium', question: 'Victoria Falls lies on the border of Zambia and which other country?', answer: 'Zimbabwe' },
  { id: 'g44', category: 'geography', difficulty: 'easy', question: 'Which is the coldest continent?', answer: 'Antarctica' },
  { id: 'g45', category: 'geography', difficulty: 'medium', question: 'How many countries are there in Africa?', answer: '54', accept: ['fifty four'] },
  { id: 'g46', category: 'geography', difficulty: 'easy', question: 'Which sea lies between Africa and Europe?', answer: 'Mediterranean', accept: ['the mediterranean', 'mediterranean sea'] },
  { id: 'g47', category: 'geography', difficulty: 'easy', question: 'Which country lies directly north of the United States?', answer: 'Canada' },
  { id: 'sc13', category: 'science', difficulty: 'easy', question: 'What gas do we need to breathe in to stay alive?', answer: 'Oxygen' },
  { id: 'sc14', category: 'science', difficulty: 'easy', question: 'At what temperature in Celsius does water boil at sea level?', answer: '100', accept: ['one hundred', 'a hundred', '100 degrees'] },
  { id: 'sc15', category: 'science', difficulty: 'easy', question: 'At what temperature in Celsius does water freeze?', answer: 'Zero', accept: ['0', 'zero degrees', '0 degrees'] },
  { id: 'sc16', category: 'science', difficulty: 'easy', question: 'Which planet is closest to the Sun?', answer: 'Mercury' },
  { id: 'sc17', category: 'science', difficulty: 'easy', question: 'What is the largest planet in our solar system?', answer: 'Jupiter', funFact: 'More than a thousand Earths could fit inside it.' },
  { id: 'sc18', category: 'science', difficulty: 'easy', question: 'Which planet is famous for its bright rings?', answer: 'Saturn' },
  { id: 'sc19', category: 'science', difficulty: 'easy', question: 'What force keeps our feet on the ground?', answer: 'Gravity' },
  { id: 'sc20', category: 'science', difficulty: 'easy', question: 'How many legs does a spider have?', answer: 'Eight', accept: ['8'] },
  { id: 'sc21', category: 'science', difficulty: 'easy', question: 'How many legs does an insect have?', answer: 'Six', accept: ['6'] },
  { id: 'sc22', category: 'science', difficulty: 'medium', question: 'What is the largest organ of the human body?', answer: 'Skin', accept: ['the skin'] },
  { id: 'sc23', category: 'science', difficulty: 'easy', question: 'What is the fastest land animal?', answer: 'Cheetah', accept: ['the cheetah'] },
  { id: 'sc24', category: 'science', difficulty: 'easy', question: 'What is the largest bird in the world?', answer: 'Ostrich', accept: ['the ostrich'] },
  { id: 'sc25', category: 'science', difficulty: 'medium', question: 'What is the only mammal that can truly fly?', answer: 'Bat', accept: ['bats', 'the bat'] },
  { id: 'sc26', category: 'science', difficulty: 'medium', question: 'How many hearts does an octopus have?', answer: 'Three', accept: ['3'] },
  { id: 'sc27', category: 'science', difficulty: 'medium', question: 'What part of a cell is known as its powerhouse?', answer: 'Mitochondria', accept: ['the mitochondria', 'mitochondrion'] },
  { id: 'sc28', category: 'science', difficulty: 'medium', question: 'Which vitamin does your skin make in sunlight?', answer: 'Vitamin D' },
  { id: 'sc29', category: 'science', difficulty: 'medium', question: 'What is the chemical name for table salt?', answer: 'Sodium chloride' },
  { id: 'sc30', category: 'science', difficulty: 'easy', question: 'Which disease is spread by the bite of the Anopheles mosquito?', answer: 'Malaria' },
  { id: 'sc31', category: 'science', difficulty: 'medium', question: 'What is normal human body temperature in degrees Celsius, roughly?', answer: '37', accept: ['thirty seven', '37 degrees'] },
  { id: 'sc32', category: 'science', difficulty: 'medium', question: 'How many teeth does an adult human usually have?', answer: '32', accept: ['thirty two'], funFact: 'That includes the four wisdom teeth.' },
  { id: 'sc33', category: 'science', difficulty: 'easy', question: 'What is the name of the galaxy we live in?', answer: 'Milky Way', accept: ['the milky way'] },
  { id: 'sc34', category: 'science', difficulty: 'easy', question: 'Which scientist came up with the theory of relativity?', answer: 'Albert Einstein', accept: ['einstein'] },
  { id: 'sc35', category: 'science', difficulty: 'easy', question: 'Which scientist described the laws of motion and gravity?', answer: 'Isaac Newton', accept: ['newton'] },
  { id: 'sc36', category: 'science', difficulty: 'medium', question: 'Who discovered penicillin?', answer: 'Alexander Fleming', accept: ['fleming'], funFact: 'He noticed mould killing bacteria on a dish he had left out, in 1928.' },
  { id: 'sc37', category: 'science', difficulty: 'medium', question: 'Which gas makes up most of the air we breathe?', answer: 'Nitrogen', funFact: 'About seventy-eight percent. Oxygen is only about twenty-one.' },
  { id: 'sc38', category: 'science', difficulty: 'easy', question: 'In biology, what class of animal is a whale?', answer: 'Mammal', accept: ['a mammal', 'mammals'] },
  { id: 'sc39', category: 'science', difficulty: 'medium', question: 'Which organs filter your blood to make urine?', answer: 'Kidneys', accept: ['kidney', 'the kidneys'] },
  { id: 'sc40', category: 'science', difficulty: 'medium', question: 'How many chambers does the human heart have?', answer: 'Four', accept: ['4'] },
  { id: 'sc41', category: 'science', difficulty: 'medium', question: 'What is the centre of an atom called?', answer: 'Nucleus', accept: ['the nucleus'] },
  { id: 'sc42', category: 'science', difficulty: 'medium', question: 'Which planet is often called the Morning Star?', answer: 'Venus' },
  { id: 'sc43', category: 'science', difficulty: 'medium', question: 'What is the longest bone in the human body?', answer: 'Femur', accept: ['the femur', 'thigh bone', 'thighbone'] },
  { id: 'sc44', category: 'science', difficulty: 'hard', question: 'What is the smallest bone in the human body?', answer: 'Stapes', accept: ['stirrup', 'the stapes'], funFact: 'It sits in the middle ear.' },
  { id: 'h9', category: 'history', difficulty: 'easy', question: 'Who was the first President of the United States?', answer: 'George Washington', accept: ['washington'] },
  { id: 'h10', category: 'history', difficulty: 'easy', question: 'In which year did the Titanic sink?', answer: '1912', accept: ['nineteen twelve', 'nineteen 12'] },
  { id: 'h11', category: 'history', difficulty: 'medium', question: 'In which year did the First World War begin?', answer: '1914', accept: ['nineteen fourteen', 'nineteen 14'] },
  { id: 'h12', category: 'history', difficulty: 'medium', question: 'Who was the first woman to fly solo across the Atlantic?', answer: 'Amelia Earhart', accept: ['earhart'], funFact: 'She did it in 1932.' },
  { id: 'h13', category: 'history', difficulty: 'easy', question: 'Julius Caesar was a leader of which ancient people?', answer: 'Romans', accept: ['roman', 'the romans', 'rome'] },
  { id: 'h14', category: 'history', difficulty: 'easy', question: 'Which famous wall in Germany came down in 1989?', answer: 'Berlin Wall', accept: ['berlin', 'the berlin wall'] },
  { id: 'h15', category: 'history', difficulty: 'medium', question: 'In which country did the Industrial Revolution begin?', answer: 'Britain', accept: ['great britain', 'england', 'united kingdom', 'uk', 'the uk'] },
  { id: 'h16', category: 'history', difficulty: 'easy', question: 'Who was the first Black President of the United States?', answer: 'Barack Obama', accept: ['obama'] },
  { id: 'h17', category: 'history', difficulty: 'medium', question: 'Who is credited with inventing the telephone?', answer: 'Alexander Graham Bell', accept: ['graham bell', 'bell'] },
  { id: 'h18', category: 'history', difficulty: 'medium', question: 'Which ship carried the Pilgrims to America in 1620?', answer: 'Mayflower', accept: ['the mayflower'] },
  { id: 'h19', category: 'history', difficulty: 'medium', question: 'Which Roman city was buried when Mount Vesuvius erupted in 79 AD?', answer: 'Pompeii' },
  { id: 'h20', category: 'history', difficulty: 'easy', question: 'Who was the first person to travel into space?', answer: 'Yuri Gagarin', accept: ['gagarin'], funFact: 'He orbited the Earth once in 1961.' },
  { id: 'h21', category: 'history', difficulty: 'medium', question: 'In which year did Ghana become independent?', answer: '1957', accept: ['nineteen fifty seven', 'nineteen 57'], funFact: 'It was the first colony south of the Sahara to win independence.' },
  { id: 'h22', category: 'history', difficulty: 'easy', question: 'Who was Ghana\'s first President?', answer: 'Kwame Nkrumah', accept: ['nkrumah'] },
  { id: 'h23', category: 'history', difficulty: 'medium', question: 'Which king built the Zulu nation into a great power in the early 1800s?', answer: 'Shaka', accept: ['shaka zulu'] },
  { id: 'h24', category: 'history', difficulty: 'hard', question: 'The ancient city of Carthage is in which modern country?', answer: 'Tunisia' },
  { id: 'h25', category: 'history', difficulty: 'easy', question: 'Which Egyptian queen was allied with the Roman Mark Antony?', answer: 'Cleopatra' },
  { id: 'h26', category: 'history', difficulty: 'medium', question: 'What was the name of the first artificial satellite, launched in 1957?', answer: 'Sputnik', accept: ['sputnik one', 'sputnik 1'] },
  { id: 'h27', category: 'history', difficulty: 'easy', question: 'Who was Kenya\'s first President?', answer: 'Jomo Kenyatta', accept: ['kenyatta'] },
  { id: 'h28', category: 'history', difficulty: 'easy', question: 'Which organisation was founded in 1945 to keep peace between nations?', answer: 'United Nations', accept: ['the united nations', 'un', 'u n'] },
  { id: 'h29', category: 'history', difficulty: 'hard', question: 'Which organisation did the African Union replace in 2002?', answer: 'OAU', accept: ['o a u', 'organisation of african unity', 'organization of african unity'] },
  { id: 'h30', category: 'history', difficulty: 'medium', question: 'Martin Luther King gave which famous speech in 1963?', answer: 'I Have a Dream', accept: ['i have a dream speech'] },
  { id: 'h31', category: 'history', difficulty: 'medium', question: 'Which European country colonised Nigeria?', answer: 'Britain', accept: ['great britain', 'england', 'united kingdom', 'uk', 'the uk'] },
  { id: 'sp8', category: 'sport', difficulty: 'easy', question: 'How many players does a basketball team have on court?', answer: 'Five', accept: ['5'] },
  { id: 'sp9', category: 'sport', difficulty: 'easy', question: 'How many minutes does a standard football match last?', answer: '90', accept: ['ninety', '90 minutes'] },
  { id: 'sp10', category: 'sport', difficulty: 'easy', question: 'In which sport do players hit a shuttlecock?', answer: 'Badminton' },
  { id: 'sp11', category: 'sport', difficulty: 'medium', question: 'In tennis, what is a score of zero called?', answer: 'Love' },
  { id: 'sp12', category: 'sport', difficulty: 'easy', question: 'Which country hosted the 2010 FIFA World Cup?', answer: 'South Africa', funFact: 'The first World Cup ever held in Africa.' },
  { id: 'sp13', category: 'sport', difficulty: 'easy', question: 'Which country won the 2022 FIFA World Cup?', answer: 'Argentina' },
  { id: 'sp14', category: 'sport', difficulty: 'easy', question: 'Which footballer captained Argentina to the 2022 World Cup?', answer: 'Lionel Messi', accept: ['messi'] },
  { id: 'sp15', category: 'sport', difficulty: 'easy', question: 'Which footballer is known as CR7?', answer: 'Cristiano Ronaldo', accept: ['ronaldo', 'cristiano'] },
  { id: 'sp16', category: 'sport', difficulty: 'medium', question: 'Which Jamaican sprinter won the Olympic 100 metres in 2008, 2012 and 2016?', answer: 'Usain Bolt', accept: ['bolt'] },
  { id: 'sp17', category: 'sport', difficulty: 'easy', question: 'How many holes are on a standard golf course?', answer: '18', accept: ['eighteen'] },
  { id: 'sp18', category: 'sport', difficulty: 'medium', question: 'How many points is a touchdown worth in American football?', answer: 'Six', accept: ['6'] },
  { id: 'sp19', category: 'sport', difficulty: 'medium', question: 'Which country has won the most Africa Cup of Nations titles?', answer: 'Egypt' },
  { id: 'sp20', category: 'sport', difficulty: 'easy', question: 'Which city hosted the 2012 Summer Olympics?', answer: 'London' },
  { id: 'sp21', category: 'sport', difficulty: 'easy', question: 'Which sport is played at Wimbledon?', answer: 'Tennis' },
  { id: 'sp22', category: 'sport', difficulty: 'medium', question: 'How many players does a volleyball team have on court?', answer: 'Six', accept: ['6'] },
  { id: 'sp23', category: 'sport', difficulty: 'hard', question: 'In snooker, what score is known as a maximum break?', answer: '147', accept: ['one hundred and forty seven', 'one forty seven'] },
  { id: 'sp24', category: 'sport', difficulty: 'easy', question: 'In boxing, what does KO stand for?', answer: 'Knockout', accept: ['knock out'] },
  { id: 'sp25', category: 'sport', difficulty: 'easy', question: 'Which boxer called himself The Greatest?', answer: 'Muhammad Ali', accept: ['ali'] },
  { id: 'sp26', category: 'sport', difficulty: 'medium', question: 'In cricket, how many balls are bowled in an over?', answer: 'Six', accept: ['6'] },
  { id: 'sp27', category: 'sport', difficulty: 'easy', question: 'How many minutes are in each half of a football match?', answer: '45', accept: ['forty five'] },
  { id: 'sp28', category: 'sport', difficulty: 'easy', question: 'What colour card sends a footballer off the pitch?', answer: 'Red', accept: ['red card', 'a red card'] },
  { id: 'sp29', category: 'sport', difficulty: 'medium', question: 'How many players does a netball team have on court?', answer: 'Seven', accept: ['7'] },
  { id: 'sp30', category: 'sport', difficulty: 'easy', question: 'Which Premier League club is nicknamed the Gunners?', answer: 'Arsenal' },
  { id: 'sp31', category: 'sport', difficulty: 'easy', question: 'Which Premier League club is nicknamed the Red Devils?', answer: 'Manchester United', accept: ['man united', 'man u', 'man utd'] },
  { id: 'sp32', category: 'sport', difficulty: 'medium', question: 'Which Spanish club plays at the Santiago Bernabeu stadium?', answer: 'Real Madrid' },
  { id: 'sp33', category: 'sport', difficulty: 'medium', question: 'Which Nigerian midfielder won the Champions League with Chelsea in 2012?', answer: 'John Obi Mikel', accept: ['mikel', 'obi mikel', 'mikel obi', 'john mikel obi'] },
  { id: 'sp34', category: 'sport', difficulty: 'medium', question: 'In which sport would you perform a tackle, a scrum and a lineout?', answer: 'Rugby', accept: ['rugby union'] },
  { id: 'sp35', category: 'sport', difficulty: 'easy', question: 'Which game ends with the word checkmate?', answer: 'Chess' },
  { id: 'm7', category: 'screen_and_song', difficulty: 'easy', question: 'Which Disney film features the song Let It Go?', answer: 'Frozen' },
  { id: 'm8', category: 'screen_and_song', difficulty: 'easy', question: 'Which film is about a lion cub called Simba?', answer: 'The Lion King', accept: ['lion king'] },
  { id: 'm9', category: 'screen_and_song', difficulty: 'easy', question: 'Who is known as the King of Pop?', answer: 'Michael Jackson', accept: ['jackson'] },
  { id: 'm10', category: 'screen_and_song', difficulty: 'easy', question: 'Which band sang Hey Jude?', answer: 'The Beatles', accept: ['beatles'] },
  { id: 'm11', category: 'screen_and_song', difficulty: 'easy', question: 'Which superhero is known as the Dark Knight?', answer: 'Batman' },
  { id: 'm12', category: 'screen_and_song', difficulty: 'easy', question: 'Which Marvel hero swings a hammer called Mjolnir?', answer: 'Thor' },
  { id: 'm13', category: 'screen_and_song', difficulty: 'easy', question: 'Which young wizard goes to Hogwarts with Ron and Hermione?', answer: 'Harry Potter', accept: ['harry'] },
  { id: 'm14', category: 'screen_and_song', difficulty: 'medium', question: 'How many strings does a violin have?', answer: 'Four', accept: ['4'] },
  { id: 'm15', category: 'screen_and_song', difficulty: 'medium', question: 'The West African drum that can copy the rise and fall of speech is called what?', answer: 'Talking drum', accept: ['talking drums', 'the talking drum'] },
  { id: 'm16', category: 'screen_and_song', difficulty: 'medium', question: 'Which girl group was Beyonce part of before going solo?', answer: 'Destiny\'s Child', accept: ['destinys child', 'destiny s child'] },
  { id: 'm17', category: 'screen_and_song', difficulty: 'easy', question: 'Which rapper was born Marshall Mathers?', answer: 'Eminem' },
  { id: 'm18', category: 'screen_and_song', difficulty: 'easy', question: 'Which film about a sinking ship won Best Picture in 1998?', answer: 'Titanic' },
  { id: 'm19', category: 'screen_and_song', difficulty: 'easy', question: 'Which Pixar film follows a clownfish searching for his son?', answer: 'Finding Nemo', accept: ['nemo'] },
  { id: 'm20', category: 'screen_and_song', difficulty: 'easy', question: 'What is the name of the cowboy doll in Toy Story?', answer: 'Woody' },
  { id: 'm21', category: 'screen_and_song', difficulty: 'medium', question: 'Which comedian is widely credited as a pioneer of stand-up comedy in Nigeria?', answer: 'Ali Baba', accept: ['alibaba'] },
  { id: 'm22', category: 'screen_and_song', difficulty: 'easy', question: 'What is the Nigerian edition of Big Brother called?', answer: 'Big Brother Naija', accept: ['bbnaija', 'big brother nigeria', 'bb naija'] },
  { id: 'm23', category: 'screen_and_song', difficulty: 'medium', question: 'Which South African singer made Pata Pata famous?', answer: 'Miriam Makeba', accept: ['makeba'] },
  { id: 'm24', category: 'screen_and_song', difficulty: 'medium', question: 'How many keys does a standard piano have?', answer: '88', accept: ['eighty eight'], funFact: 'Fifty-two white and thirty-six black.' },
  { id: 'm25', category: 'screen_and_song', difficulty: 'easy', question: 'Which singer released Rolling in the Deep?', answer: 'Adele' },
  { id: 'm26', category: 'screen_and_song', difficulty: 'easy', question: 'Which reggae star sang One Love?', answer: 'Bob Marley', accept: ['marley'] },
  { id: 'm27', category: 'screen_and_song', difficulty: 'easy', question: 'Which company created Mickey Mouse?', answer: 'Disney', accept: ['walt disney'] },
  { id: 'm28', category: 'screen_and_song', difficulty: 'easy', question: 'What is the name of the talking snowman in Frozen?', answer: 'Olaf' },
  { id: 'm29', category: 'screen_and_song', difficulty: 'easy', question: 'What is the name of the fairy in Peter Pan?', answer: 'Tinker Bell', accept: ['tinkerbell'] },
  { id: 'gk9', category: 'general', difficulty: 'easy', question: 'How many hours are in a day?', answer: '24', accept: ['twenty four'] },
  { id: 'gk10', category: 'general', difficulty: 'easy', question: 'How many sides does an octagon have?', answer: 'Eight', accept: ['8'] },
  { id: 'gk11', category: 'general', difficulty: 'medium', question: 'What is the square root of 144?', answer: '12', accept: ['twelve'] },
  { id: 'gk12', category: 'general', difficulty: 'easy', question: 'Who painted the Mona Lisa?', answer: 'Leonardo da Vinci', accept: ['da vinci', 'leonardo'] },
  { id: 'gk13', category: 'general', difficulty: 'hard', question: 'In which language was the New Testament first written?', answer: 'Greek' },
  { id: 'gk14', category: 'general', difficulty: 'easy', question: 'How many weeks are in a year?', answer: '52', accept: ['fifty two'] },
  { id: 'gk15', category: 'general', difficulty: 'easy', question: 'What is a baby cat called?', answer: 'Kitten' },
  { id: 'gk16', category: 'general', difficulty: 'easy', question: 'What is a baby dog called?', answer: 'Puppy', accept: ['pup'] },
  { id: 'gk17', category: 'general', difficulty: 'medium', question: 'What is a group of fish swimming together called?', answer: 'School', accept: ['shoal', 'a school', 'a shoal'] },
  { id: 'gk18', category: 'general', difficulty: 'easy', question: 'Which is the shortest month of the year?', answer: 'February' },
  { id: 'gk19', category: 'general', difficulty: 'easy', question: 'How many zeros are in one million?', answer: 'Six', accept: ['6'] },
  { id: 'gk20', category: 'general', difficulty: 'easy', question: 'Which shape has four equal sides and four right angles?', answer: 'Square', accept: ['a square'] },
  { id: 'gk21', category: 'general', difficulty: 'medium', question: 'What do you call a word that reads the same backwards, like level?', answer: 'Palindrome', accept: ['a palindrome'] },
  { id: 'gk22', category: 'general', difficulty: 'medium', question: 'What is the main ingredient in guacamole?', answer: 'Avocado', accept: ['avocados'] },
  { id: 'gk23', category: 'general', difficulty: 'easy', question: 'How many years are in a century?', answer: '100', accept: ['one hundred', 'a hundred'] },
  { id: 'gk24', category: 'general', difficulty: 'easy', question: 'How many years are in a decade?', answer: 'Ten', accept: ['10'] },
  { id: 'gk25', category: 'general', difficulty: 'easy', question: 'What is the plural of mouse?', answer: 'Mice' },
  { id: 'gk26', category: 'general', difficulty: 'easy', question: 'Which company makes the iPhone?', answer: 'Apple' },
  { id: 'gk27', category: 'general', difficulty: 'easy', question: 'What does www stand for in a web address?', answer: 'World Wide Web' },
  { id: 'gk28', category: 'general', difficulty: 'easy', question: 'In which city is the Eiffel Tower?', answer: 'Paris' },
  { id: 'gk29', category: 'general', difficulty: 'easy', question: 'In which country is the Taj Mahal?', answer: 'India' },
  { id: 'gk30', category: 'general', difficulty: 'easy', question: 'What do you use to measure temperature?', answer: 'Thermometer', accept: ['a thermometer'] },
  { id: 'gk31', category: 'general', difficulty: 'easy', question: 'What do you use to look at distant stars?', answer: 'Telescope', accept: ['a telescope'] },
  { id: 'gk32', category: 'general', difficulty: 'medium', question: 'Which Dubai skyscraper became the tallest building in the world in 2010?', answer: 'Burj Khalifa' },
  { id: 'gk33', category: 'general', difficulty: 'easy', question: 'How many colours are in a rainbow?', answer: 'Seven', accept: ['7'] },
  { id: 'gk34', category: 'general', difficulty: 'medium', question: 'What is the word for the opposite of a synonym?', answer: 'Antonym', accept: ['an antonym'] },
  { id: 'gk35', category: 'general', difficulty: 'medium', question: 'How many seconds are in an hour?', answer: '3600', accept: ['three thousand six hundred', 'thirty six hundred'] },
  { id: 'gk36', category: 'general', difficulty: 'medium', question: 'What is the only even prime number?', answer: 'Two', accept: ['2'] },
  { id: 'gk37', category: 'general', difficulty: 'easy', question: 'How many cards are in a standard deck, without jokers?', answer: '52', accept: ['fifty two'] },
  { id: 'gk38', category: 'general', difficulty: 'medium', question: 'What is the fear of spiders called?', answer: 'Arachnophobia' },
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
