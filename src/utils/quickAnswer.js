// Inline answers for the search box: arithmetic, "20% of 50" and unit conversions.
// Everything is evaluated locally; nothing is sent anywhere.

const UNITS = {
  length: {
    base: 'm',
    units: {
      mm: [0.001, 'millimeter millimeters millimetre millimetres mm'],
      cm: [0.01, 'centimeter centimeters centimetre centimetres cm'],
      m: [1, 'meter meters metre metres m'],
      km: [1000, 'kilometer kilometers kilometre kilometres km'],
      in: [0.0254, 'inch inches in'],
      ft: [0.3048, 'foot feet ft'],
      yd: [0.9144, 'yard yards yd'],
      mi: [1609.344, 'mile miles mi']
    }
  },
  mass: {
    base: 'kg',
    units: {
      mg: [0.000001, 'milligram milligrams mg'],
      g: [0.001, 'gram grams g'],
      kg: [1, 'kilogram kilograms kg kilo kilos'],
      oz: [0.028349523125, 'ounce ounces oz'],
      lb: [0.45359237, 'pound pounds lb lbs'],
      st: [6.35029318, 'stone stones st']
    }
  },
  volume: {
    base: 'l',
    units: {
      ml: [0.001, 'milliliter milliliters millilitre millilitres ml'],
      l: [1, 'liter liters litre litres l'],
      floz: [0.0295735295625, 'floz fl.oz'],
      cup: [0.2365882365, 'cup cups'],
      pt: [0.473176473, 'pint pints pt'],
      qt: [0.946352946, 'quart quarts qt'],
      gal: [3.785411784, 'gallon gallons gal']
    }
  },
  time: {
    base: 's',
    units: {
      ms: [0.001, 'millisecond milliseconds ms'],
      s: [1, 'second seconds sec secs s'],
      min: [60, 'minute minutes min mins'],
      h: [3600, 'hour hours hr hrs h'],
      d: [86400, 'day days d'],
      wk: [604800, 'week weeks wk']
    }
  },
  data: {
    base: 'b',
    units: {
      b: [1, 'byte bytes b'],
      kb: [1024, 'kilobyte kilobytes kb'],
      mb: [1048576, 'megabyte megabytes mb'],
      gb: [1073741824, 'gigabyte gigabytes gb'],
      tb: [1099511627776, 'terabyte terabytes tb']
    }
  },
  speed: {
    base: 'mps',
    units: {
      mps: [1, 'm/s mps'],
      kph: [1 / 3.6, 'kph km/h kmh kmph'],
      mph: [0.44704, 'mph mi/h'],
      kn: [0.514444, 'knot knots kn']
    }
  }
};

const TEMPERATURES = {
  c: 'celsius centigrade c °c',
  f: 'fahrenheit f °f',
  k: 'kelvin k'
};

const ALIASES = new Map();
Object.entries(UNITS).forEach(([group, { units }]) => {
  Object.entries(units).forEach(([unit, [, names]]) => {
    names.split(' ').forEach((name) => ALIASES.set(name, { group, unit }));
  });
});
Object.entries(TEMPERATURES).forEach(([unit, names]) => {
  names.split(' ').forEach((name) => ALIASES.set(name, { group: 'temperature', unit }));
});

const toKelvin = { c: (v) => v + 273.15, f: (v) => ((v - 32) * 5) / 9 + 273.15, k: (v) => v };
const fromKelvin = { c: (v) => v - 273.15, f: (v) => ((v - 273.15) * 9) / 5 + 32, k: (v) => v };

export function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  const rounded = Number(value.toPrecision(10));
  const abs = Math.abs(rounded);
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-6)) {
    return rounded.toExponential(6).replace(/\.?0+e/, 'e');
  }
  return rounded.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function convert(text) {
  const match = text.match(/^(-?[\d.,]+)\s*([a-z°/.]+)\s+(?:to|in|into|as|=|->)\s+([a-z°/.]+)$/i);
  if (!match) {
    return null;
  }
  const value = Number(match[1].replace(/,/g, ''));
  const from = ALIASES.get(match[2].toLowerCase());
  const to = ALIASES.get(match[3].toLowerCase());
  if (!Number.isFinite(value) || !from || !to || from.group !== to.group) {
    return null;
  }

  let result;
  if (from.group === 'temperature') {
    result = fromKelvin[to.unit](toKelvin[from.unit](value));
  } else {
    const { units } = UNITS[from.group];
    result = (value * units[from.unit][0]) / units[to.unit][0];
  }

  const formatted = formatNumber(result);
  const label = from.group === 'temperature' ? `${to.unit.toUpperCase()}` : to.unit;
  return formatted ? { label: text, result: `${formatted} ${from.group === 'temperature' ? `°${label}` : label}`, copy: formatted } : null;
}

// Small recursive-descent parser so user input is never passed to eval().
function evaluate(source) {
  const tokens = source.match(/\d+\.?\d*|\.\d+|[a-z]+|[-+*/^%(),]/gi);
  if (!tokens || tokens.join('').length !== source.replace(/\s+/g, '').length) {
    return null;
  }
  let index = 0;
  const peek = () => tokens[index];
  const next = () => tokens[index++];

  function primary() {
    const token = next();
    if (token === undefined) {
      throw new Error('end');
    }
    if (/^[\d.]/.test(token)) {
      return Number(token);
    }
    if (token === '(') {
      const value = expression();
      if (next() !== ')') {
        throw new Error('paren');
      }
      return value;
    }
    if (token === '-') {
      return -power();
    }
    if (token === '+') {
      return power();
    }
    const name = token.toLowerCase();
    if (name === 'pi') {
      return Math.PI;
    }
    if (name === 'e') {
      return Math.E;
    }
    const fn = { sqrt: Math.sqrt, abs: Math.abs, sin: Math.sin, cos: Math.cos, tan: Math.tan, ln: Math.log, log: Math.log10 }[name];
    if (fn && next() === '(') {
      const value = expression();
      if (next() !== ')') {
        throw new Error('paren');
      }
      return fn(value);
    }
    throw new Error('token');
  }

  function percent() {
    let value = primary();
    while (peek() === '%' && !/^[\d.(a-z]/i.test(tokens[index + 1] ?? '')) {
      next();
      value /= 100;
    }
    return value;
  }

  function power() {
    const base = percent();
    if (peek() === '^') {
      next();
      return base ** power();
    }
    return base;
  }

  function term() {
    let value = power();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = next();
      const right = power();
      value = op === '*' ? value * right : op === '/' ? value / right : value % right;
    }
    return value;
  }

  function expression() {
    let value = term();
    while (peek() === '+' || peek() === '-') {
      value = next() === '+' ? value + term() : value - term();
    }
    return value;
  }

  try {
    const value = expression();
    return index === tokens.length ? value : null;
  } catch {
    return null;
  }
}

export function quickAnswer(input) {
  const text = input.trim();
  if (!text || text.length > 80) {
    return null;
  }

  const percentOf = text.match(/^(-?[\d.]+)\s*%\s*of\s*(-?[\d.,]+)$/i);
  if (percentOf) {
    const value = (Number(percentOf[1]) / 100) * Number(percentOf[2].replace(/,/g, ''));
    const formatted = formatNumber(value);
    return formatted ? { label: text, result: formatted, copy: formatted } : null;
  }

  const converted = convert(text);
  if (converted) {
    return converted;
  }

  // Needs an operator or function, so a bare number or word is not treated as a sum.
  const expression = text.replace(/,/g, '').replace(/(\d)\s*[x×]\s*(\d)/gi, '$1*$2').replace(/÷/g, '/');
  if (!/[-+*/^%]|sqrt|abs|sin|cos|tan|ln|log/i.test(expression) || !/\d|pi/i.test(expression)) {
    return null;
  }
  const value = evaluate(expression);
  const formatted = value === null ? null : formatNumber(value);
  return formatted ? { label: text, result: formatted, copy: formatted } : null;
}
