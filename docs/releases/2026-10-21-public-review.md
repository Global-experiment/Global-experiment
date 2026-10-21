# Public website review — 21 October 2026

These are the changes from your review of the public website and the
donation flow. Payments are still in Stripe test mode, so no real money
moves.

## What changed

- **One header on every page.** On the right there are exactly two icons:
  **Share** and the **menu (⋮)**. The theme switch, the currency button and
  the chart icon are no longer in the header.
- **Every menu has "Send feedback" and "Report issue".** Both open the
  existing forms and remember which page you came from. Each page keeps its
  own menu items. On Donate, the currency choice ("Currency: USD") and the
  Treasury link are now menu items.
- **Treasury entries:** "Report issue" now sits next to "Send feedback",
  as under every documentation article.
- **Messages ("Link copied to clipboard", "Donation sent") always appear
  above** the Donate button at the bottom and above any open menu, on
  phones and computers.
- **Everything is a little bigger:** about 6% on computers and 12% on
  phones. The size is one setting and can be changed in one place.
  Checkboxes keep their size relative to the text. Nothing scrolls
  sideways from small phones (320 px) to wide screens.
- **Donations always go to Stripe's own payment page**, for one-off and
  monthly gifts. The card form inside our Donate page is switched off.
  The wording on the Donate page is unchanged.
- **Stripe's payment page asks for as little as possible.** We removed the
  phone number, the shipping address, extra fields, the terms checkbox and
  Stripe's "Save my information" box (it was ticked by default and asked
  for a phone number). The address is asked only when the payment method
  requires it. We add no name field of our own.

## What Stripe's payment page shows

**Stripe always asks for an email address on its payment page, even for a
one-off gift.** This can't be turned off on Stripe's page. For monthly
gifts the email is also needed so the donor can cancel.

| Payment method | One-off | Monthly |
|---|---|---|
| Card | Email, card number, expiry date, security code (CVC), name on card, country. A ZIP code only for cards from the United States. | The same fields. |
| Apple Pay / Google Pay | The same card page. The Apple Pay or Google Pay button appears only on a phone or browser that supports it; the wallet shares its own details. | The same. |
| PayPal | Email only; the rest happens in PayPal's window. | Email only. |
| SEPA direct debit (euros) | Email, IBAN, name on the account and full address (required by the bank for a direct debit). | The same fields. |

## Please test

On a computer and on a phone, in dark and light mode:

1. Home, Documentation, an article, Treasury, an expense, a donation,
   Donate, Waitlist, Contribute, Feedback and Issue: check the header has
   only Share and ⋮, scroll down (the header stays), and open the menu.
2. Press Share on a computer: "Link copied to clipboard" should appear
   above the Donate button. On a phone, Share opens the phone's share menu.
3. In a menu, press "Report issue": the issue form opens for that page.
4. Donate: change the currency from the menu. Make a one-off and a
   monthly test donation (card 4242 4242 4242 4242, any future date, any
   CVC) and look at the fields on Stripe's page.
5. Treasury: open an expense and check "Send feedback" and "Report issue".

## Known limitations

- Stripe's page always asks for an email address.
- The "Currency" menu item uses the bank icon from the Figma set: the
  designs have no currency icon.
- To try light mode, use the switch on the admin profile card. The public
  header no longer has one.
