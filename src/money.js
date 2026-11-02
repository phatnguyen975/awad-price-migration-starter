// price is thousands of dong; priceVnd is integer dong. One conversion rule.
export const toVnd = (thousands) => Math.round(thousands * 1000);
export const toThousands = (vnd) => vnd / 1000;
