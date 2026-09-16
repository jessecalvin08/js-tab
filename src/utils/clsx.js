export default function clsx(...tokens) {
  return tokens.filter(Boolean).join(' ');
}
