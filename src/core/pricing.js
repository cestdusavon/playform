/*
 * Rate card evaluation. Printed area is priced separately from cut length
 * because UV coverage is the real cost driver on acrylic. The customer
 * sees one total; the breakdown rides along in the order spec.
 * No DOM, no Shopify.
 */

/* Round to cents, half-up (0.005 -> 0.01), with decimal semantics: 1.005
   stores as 1.00499999… in binary, so snap to 6 decimal places in cents
   before applying the half-up rule. */
export function roundCents(v) {
  return Math.floor(Number((v * 100).toFixed(6)) + 0.5) / 100;
}

/*
 * rateCard: the schema's pricing block (see build spec).
 * metrics: {
 *   areaSqIn,            // bounding footprint of the piece
 *   letters,             // countable characters
 *   cutLengthIn,         // total CUT layer path length
 *   printedAreaSqIn,     // area of PRINT layer artwork
 *   materialKey,         // e.g. "pla" | "acrylic"
 *   thicknessKey         // e.g. "3mm"
 * }
 * Returns { total, breakdown } — total already rounded, minimum enforced
 * after multipliers and before display.
 */
export function evaluatePricing(rateCard, metrics) {
  const rc = rateCard || {};
  const m = metrics || {};

  const setup = rc.setupFee || 0;
  const area = (rc.perSquareInch || 0) * (m.areaSqIn || 0);
  const letters = (rc.perLetter || 0) * (m.letters || 0);
  const cut = (rc.perInchOfCut || 0) * (m.cutLengthIn || 0);
  const printed = (rc.perSquareInchPrinted || 0) * (m.printedAreaSqIn || 0);

  const subtotal = setup + area + letters + cut + printed;

  const matMult = (rc.materialMultipliers && m.materialKey && rc.materialMultipliers[m.materialKey]) || 1;
  const thickMult = (rc.thicknessMultipliers && m.thicknessKey && rc.thicknessMultipliers[m.thicknessKey]) || 1;

  const multiplied = subtotal * matMult * thickMult;
  const minimum = rc.minimum || 0;
  const total = roundCents(Math.max(multiplied, minimum));

  return {
    total,
    breakdown: {
      setup: roundCents(setup),
      area: roundCents(area),
      letters: roundCents(letters),
      cut: roundCents(cut),
      printed: roundCents(printed),
      materialMultiplier: matMult,
      thicknessMultiplier: thickMult,
      beforeMinimum: roundCents(multiplied),
      minimumApplied: multiplied < minimum,
      total,
    },
  };
}
