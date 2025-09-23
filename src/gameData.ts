import type { Item } from "./gameUtils";

/* ---------- Sample items (edit freely) ---------- */
export const SAMPLE_ITEMS: Omit<Item, "id">[] = [
  { name: "Evenflo Balance Wide-Neck Anti-Colic Baby Bottles - 9oz/2pk", price: 9.99, imageUrl: "https://target.scene7.com/is/image/Target/GUEST_9e58c1dc-4129-4283-8212-27eacde304b3?wid=1200&hei=1200&qlt=80&fmt=webp", note: "Baby Bottles!" },
  { name: "Fisher-Price Glow and Grow Kick & Play Piano Gym Baby Playmat with Musical Learning Toy", price: 59.99, imageUrl: "https://media.kohlsimg.com/is/image/kohls/7083250_Blue?wid=805&hei=805&op_sharpen=1", note: "Play time!" },
  { name: "Itzy Ritzy Friends Itzy Blocks", price: 21.99, imageUrl: "https://media.kohlsimg.com/is/image/kohls/7053912?wid=805&hei=805&op_sharpen=1", note: "Building blocks of the brain..." },
  { name: "Cottage Door Press Grandma Wishes Book", price: 9.99, imageUrl: "https://media.kohlsimg.com/is/image/kohls/2252749?wid=805&hei=805&op_sharpen=1" },
  { name: "MAM Original Curved Matte Baby Pacifier 2 Pack", price: 8.99, imageUrl: "https://media.kohlsimg.com/is/image/kohls/7083411_Pink?wid=805&hei=805&op_sharpen=1" },
  { name: "Fisher-Price Rock-A-Stack Roly-Poly Sensory Stacking Toy", price: 13.99, imageUrl: "https://media.kohlsimg.com/is/image/kohls/7158230?wid=805&hei=805&op_sharpen=1" },
  { name: "Baby Trend Cover Me™ 4-in-1 Convertible Car Seat", price: 179.99, imageUrl: "https://media.kohlsimg.com/is/image/kohls/6547103_Quartz_Pink?wid=805&hei=805&op_sharpen=1" },
  { name: "Baby Gucci logo cotton gift set", price: 330, imageUrl: "https://media.gucci.com/style/HEXFBFBFB_South_0_160_640x640/1523467807/516326_X9U05_9112_001_100_0000_Light.jpg" },
];

/* ---------- Winner Messages Library (40) ---------- */
// Toast (short) — Normal
export const TOAST_NORMAL = [
  "Closest without going over: {name}! 🎯",
  "{name} nailed it! 🎉",
  "Winner: {name}! 🍼",
  "+1 point to {name}! ⭐",
  "{name} wins this round! 🎊",
  "Baby bargain champ: {name}! 🏆",
  "Sharp shopper: {name}! ✨",
  "Point to {name}! Another step closer! 🏅",
  "No diapers wasted—{name} scores! 👶",
  "Closest call: {name}! 🎯",
  "Boom! {name} takes the round! 🎆",
  "{name} is on a roll! 🌀",
  "Price wizard: {name}! 🪄",
  "{name} snags the point! 🏁",
];

// Toast (short) — Overbid fallback
export const TOAST_OVERBID = [
  "Overbid sweep! {name} wins anyway! 🙈",
  "Fallback win: {name}! 🎯",
  "Everyone went too high—{name} takes it! 🙌",
  "ARP was lower! {name} wins anyway! 🍼",
  "Closest on top: {name}! ⭐",
  "{name} wins the overbid round! 🎉",
];

// Host (long) — Normal
export const HOST_NORMAL = [
  "Come on down, {name}! Closest without going over and scoring +1 point!",
  "Right on the money, {name}! That's the winning bid this round!",
  "{name} takes it! The smartest shopper in the nursery aisle!",
  "And the winner is… {name}! Closest without going over, just like Bob taught us!",
  "Closest to the ARP without going over… it's {name}!",
  "{name} knows their baby bargains! Winner, winner, diaper dinner!",
  "A shopping pro emerges! {name} scores the round with style!",
  "The nursery aisle never stood a chance—{name} wins it!",
  "Another point for {name}! The crib is filling up with victories!",
  "Look at that! {name} outbid the rest and takes home the win!",
  "The stork delivers… a win for {name}! 🍼",
  "Diapers, bottles, and now a point—{name} has it all!",
  "The price was right for {name}! Closest bid takes the prize!",
  "And just like that, {name} proves they know their baby gear best!",
];

// Host (long) — Overbid fallback
export const HOST_OVERBID = [
  "You allllll overbid! Closest overall wins instead—{name} takes it!",
  "Bob would be shaking his head… but {name} still wins for being the least over!",
  "Over the price, every one of you! But {name} is the closest overall!",
  "No winners by the rules—so we bend 'em! Closest overall goes to {name}!",
  "Oops, everyone went too high! {name} saves the day with the least overbid!",
  "Well, that's a sweep of overbids—but {name} still grabs the point!",
];

// Finale lines (host-style)
export const FINALE_LINES = [
  "Rattles down and smiles up—the grand champion is {name}!",
  "From playpens to podiums… {name} takes the crown!",
  "And the diaper-bag of victory belongs to… {name}!",
  "The nursery tally is in—our baby shower champ is {name}!",
  "Closest without going over, and champion of the shower: {name}!",
];

/* ---------- Prize Database ---------- */
export type Prize = {
  emoji: string;
  name: string;
  description: string;
};

export const PRIZE_DATABASE: Record<string, Prize> = {
  "🏍️": { emoji: "🏍️", name: "Motorcycle", description: "A brand new motorcycle!" },
  "🗼": { emoji: "🗼", name: "Paris Trip", description: "A trip to Paris including the Eiffel Tower!" },
  "🗽": { emoji: "🗽", name: "NYC Vacation", description: "A vacation to New York City!" },
  "⛷️": { emoji: "⛷️", name: "Ski Trip", description: "A ski trip to the mountains!" },
  "🏎️": { emoji: "🏎️", name: "Sports Car", description: "A luxury sports car!" },
  "🏖️": { emoji: "🏖️", name: "Beach Vacation", description: "A tropical beach vacation!" },
  "🌁": { emoji: "🌁", name: "San Francisco Trip", description: "A trip to San Francisco!" },
  "🏯": { emoji: "🏯", name: "Japan Trip", description: "An exotic trip to Japan!" },
  "🚢": { emoji: "🚢", name: "Cruise", description: "A luxury cruise vacation!" },
  "🚗": { emoji: "🚗", name: "New Car", description: "A brand new car!" },
  "🛻": { emoji: "🛻", name: "Pickup Truck", description: "A rugged pickup truck!" },
  "⛵": { emoji: "⛵", name: "Sailboat", description: "A beautiful sailboat!" },
  "🚤": { emoji: "🚤", name: "Speedboat", description: "A speedboat for the lake!" },
  "📺": { emoji: "📺", name: "Big Screen TV", description: "A big screen TV!" },
  "💰": { emoji: "💰", name: "Cash Prize", description: "Cold hard cash!" },
  "💍": { emoji: "💍", name: "Jewelry", description: "Beautiful jewelry!" },
  // "💵": { emoji: "💵", name: "More Cash", description: "More cash prizes!" },
  "🚐": { emoji: "🚐", name: "Family Van", description: "A family van!" },
  "🛏️": { emoji: "🛏️", name: "Bedroom Set", description: "A luxury bedroom set!" },
  "🍽️": { emoji: "🍽️", name: "Dining Set", description: "A complete dining room set!" },
};

export const ALL_PRIZE_EMOJIS = Object.keys(PRIZE_DATABASE);

/* ---------- Host Scripts (Bob Barker Style) ---------- */
export const HOST_SCRIPTS = {
  WELCOME: [
    "Welcome to The Price Is Right: Baby Edition! I'm your host, and today we're playing for some fantastic prizes perfect for the little bundle of joy on the way!",
    "Come on down! You're the next contestants on The Price Is Right: Baby Edition! Today we're celebrating the upcoming arrival with some wonderful baby prizes!",
    "Hello everybody, and welcome to our special Baby Shower edition of The Price Is Right! We've got some incredible prizes lined up for our expecting parents!",
    "Good morning! It's time for The Price Is Right: Baby Edition! We're here to celebrate the newest member joining the family with some fantastic baby gear!",
  ],

  ROUND_START: [
    "Alright contestants, here's your next item up for bids. Remember, the contestant who bids closest to the actual retail price without going over wins the prize!",
    "Next up for our baby shower contestants - take a good look at this item and remember, closest without going over takes it home!",
    "Here we go with your next prize! Contestants, what do you think this essential baby item costs? Closest without going over wins!",
    "Time for the next item! Parents-to-be, put on your shopping hats and give me your best guess - closest without going over!",
  ],

  COLLECTING_BIDS: [
    "Take your time looking at this item, contestants. When you're ready, lock in your bid!",
    "Think carefully about this one - quality baby gear can vary quite a bit in price!",
    "Remember, you're bidding on the actual retail price. What would you expect to pay for this at the store?",
    "Consider the features, the brand, and the quality. What's your best guess for the retail price?",
  ],

  REVEALING_PRICE: [
    "The bids are in! Let's see who knows their baby gear prices. The actual retail price is...",
    "Time for the moment of truth! Contestants, you've made your bids. The actual retail price of this item is...",
    "All the bids are locked in! Let's find out who's been paying attention to baby prices. The actual retail price is...",
    "Here we go! One of you is about to win a fantastic prize. The actual retail price is...",
  ],

  WINNER_ANNOUNCEMENT: [
    "We have a winner! {name}, come on down! You bid closest without going over and you win {prize}!",
    "Congratulations {name}! You know your baby gear prices! You win {prize} for being closest without going over!",
    "And the winner is {name}! Perfect bid - closest without going over! You take home {prize}!",
    "Excellent bidding, {name}! You win {prize} for getting closest to the actual retail price without going over!",
  ],

  OVERBID_FALLBACK: [
    "Uh oh! All of our contestants went over the actual retail price! But don't worry - {name}, you had the closest bid overall, so you still win {prize}!",
    "Well, everybody overbid on that one! But {name}, your bid was closest to the actual price, so you're still our winner of {prize}!",
    "That's a sweep! Everyone went too high, but {name}, you were the least over, so you win {prize}!",
  ],

  GAME_WRAP: [
    "And that's a wrap on our Baby Shower edition of The Price Is Right! Congratulations to all our winners and to the parents-to-be!",
    "What a fantastic game! Thank you to all our contestants for playing, and best wishes to the growing family!",
    "That concludes our special Baby Shower Price Is Right! Great job everyone, and congratulations on the upcoming arrival!",
    "Thanks for playing The Price Is Right: Baby Edition! May your nursery be filled with love, laughter, and all these wonderful prizes!",
  ],

  BOB_SIGNATURE: [
    "This is Bob Barker reminding you to help control the pet population. Have your pets spayed or neutered. Goodbye everybody!",
    "Remember folks, help control the pet population. Have your pets spayed or neutered. Thanks for playing!",
    "Before we go, don't forget - help control the pet population. Have your pets spayed or neutered. See you next time!",
  ]
};
