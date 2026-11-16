// CC-134: twelve weekly scam-awareness tips, written for Circle Care. Each is three short sentences and a made-up
// example. Names, numbers and businesses in the examples are invented, and no real company is named as a scammer.

export interface ScamTip {
  id: string;
  title: string;
  /** Three short sentences. */
  text: string;
  /** A made-up example. */
  example: string;
}

export const SCAM_TIPS: ScamTip[] = [
  {
    id: "tip-01", title: "Your bank never asks for a code",
    text: "A real bank will never call and ask you to read out a code it just texted you. That code is the key to your account. Hang up and call the number on the back of your card.",
    example: "A caller says they are from \"Lakeside Savings\" and need the 6-digit code to stop a charge. That is the scam.",
  },
  {
    id: "tip-02", title: "Gift cards are for gifts",
    text: "No company, court or government office takes payment in gift cards. Anyone asking you to buy them and read out the numbers is stealing. Stop and call someone you trust first.",
    example: "\"Officer Dale\" says you missed jury duty and must pay a $400 fine in store gift cards today.",
  },
  {
    id: "tip-03", title: "Rushing you is the trick",
    text: "Scammers say you must act in the next hour so you don't stop to think. Real problems can wait for a phone call to family. It is always fine to say you will call them back.",
    example: "A text says your power will be cut off at 3 PM unless you pay now by tapping a link.",
  },
  {
    id: "tip-04", title: "The grandchild in trouble",
    text: "A caller may sound young and upset and say \"It's me, Grandma.\" They ask for money and beg you not to tell anyone. Hang up and call your family member on the number you already have.",
    example: "\"I'm in jail in another state and need $2,000 for bail. Please don't tell Mom.\"",
  },
  {
    id: "tip-05", title: "Pop-ups that say your computer is broken",
    text: "A loud warning on your screen with a phone number to call is fake. Real companies don't put phone numbers in warnings. Close the window, or turn the computer off and back on.",
    example: "A red screen says \"Virus found. Call Tech Desk at 555-0142 now.\"",
  },
  {
    id: "tip-06", title: "Prizes you didn't enter",
    text: "You can't win a contest you never entered. If you must pay a fee or tax to get your prize, there is no prize. Throw the letter away or delete the message.",
    example: "\"You've won $50,000 from the Grand Sun Sweepstakes. Send $250 to cover delivery.\"",
  },
  {
    id: "tip-07", title: "Links in texts",
    text: "Don't tap links in texts or emails you weren't expecting, even if they look official. Go to the company's website yourself, or call the number on your bill. A real problem will still be there.",
    example: "\"Your package is held. Confirm your address at parcel-help-now.example.\"",
  },
  {
    id: "tip-08", title: "Someone at the door",
    text: "A stranger who says they're from the water or power company should have an appointment and an ID badge. You don't have to let anyone in. Keep the door closed and call the company yourself.",
    example: "A man in a vest says he must check your pipes right now and asks to come inside.",
  },
  {
    id: "tip-09", title: "New friends who need money",
    text: "Someone you met online who quickly becomes close and then needs money is a warning sign. They often can't meet in person or on video. Talk to family before you send anything.",
    example: "\"Robert\" says he works on an oil rig, loves you, and needs $900 for a plane ticket home.",
  },
  {
    id: "tip-10", title: "Calls about Medicare or benefits",
    text: "Government offices write to you; they don't call to ask for your number. Never give your Medicare or Social Security number to a caller. Hang up and call the number on your card.",
    example: "A caller offers a free \"new benefits card\" if you confirm your number today.",
  },
  {
    id: "tip-11", title: "Paying for help that should be free",
    text: "Scammers offer to get your money back after a scam, for a fee. That is a second scam. Real help from your bank or the state attorney general doesn't charge you.",
    example: "\"For $300 we can recover the $2,000 you lost last month.\"",
  },
  {
    id: "tip-12", title: "When in doubt, tap \"Is this a scam?\"",
    text: "You never have to decide alone. Tap the scam button on your Circle Care home and your family will call you. Asking is always the right thing to do.",
    example: "A text from \"Pine Ridge Rewards\" offers points if you share your card number. Tap the button.",
  },
];
