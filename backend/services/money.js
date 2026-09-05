export function toPaise(rupees) {
  return Math.round(rupees * 100);
}

export function fromPaise(paise) {
  return Math.round(paise) / 100;
}

export function sumRupeesSafely(amounts) {
  const totalPaise = amounts.reduce((sum, amt) => sum + toPaise(amt), 0);
  return fromPaise(totalPaise);
}
