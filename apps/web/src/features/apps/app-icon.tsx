import {
  Activity01Icon,
  AlertDiamondIcon,
  Analytics01Icon,
  Book02Icon,
  Bug01Icon,
  Calendar03Icon,
  ChartColumnIcon,
  CheckmarkBadge01Icon,
  Clock01Icon,
  CloudIcon,
  CodeIcon,
  ComputerTerminal01Icon,
  Database01Icon,
  Dollar01Icon,
  FavouriteIcon,
  File01Icon,
  FireIcon,
  GitPullRequestIcon,
  Globe02Icon,
  Link01Icon,
  Mail01Icon,
  Message01Icon,
  Notification01Icon,
  PackageIcon,
  Rocket01Icon,
  Search01Icon,
  ServerStack01Icon,
  Shield01Icon,
  StarIcon,
  TestTube01Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { CANVAS_ICON_COLORS, type CanvasGlyph, type CanvasIcon } from '@opencodex/contracts/canvas';

const GLYPHS: Record<CanvasGlyph, typeof Bug01Icon> = {
  activity: Activity01Icon,
  alert: AlertDiamondIcon,
  analytics: Analytics01Icon,
  book: Book02Icon,
  bug: Bug01Icon,
  calendar: Calendar03Icon,
  chart: ChartColumnIcon,
  chat: Message01Icon,
  check: CheckmarkBadge01Icon,
  clock: Clock01Icon,
  cloud: CloudIcon,
  code: CodeIcon,
  database: Database01Icon,
  dollar: Dollar01Icon,
  file: File01Icon,
  fire: FireIcon,
  globe: Globe02Icon,
  heart: FavouriteIcon,
  link: Link01Icon,
  mail: Mail01Icon,
  notification: Notification01Icon,
  package: PackageIcon,
  'pull-request': GitPullRequestIcon,
  rocket: Rocket01Icon,
  search: Search01Icon,
  server: ServerStack01Icon,
  shield: Shield01Icon,
  star: StarIcon,
  terminal: ComputerTerminal01Icon,
  test: TestTube01Icon,
  users: UserGroupIcon,
};

/** Apps without a color keep a stable one, so the sidebar doesn't read as a gray column. */
function fallbackColor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const colors = CANVAS_ICON_COLORS.filter((color) => color !== 'gray');
  return colors[hash % colors.length]!;
}

/** An app's glyph on a colored tile, styled like project icons; its initial when it has no glyph. */
export function AppIcon({
  id,
  title,
  icon,
  size = 20,
}: {
  id: string;
  title: string;
  icon?: CanvasIcon;
  size?: number;
}) {
  const glyph = icon?.glyph && GLYPHS[icon.glyph];
  return (
    <span
      className="project-icon app-icon"
      data-color={icon?.color ?? fallbackColor(id)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.62) }}
      aria-hidden="true"
    >
      {glyph ? (
        <HugeiconsIcon icon={glyph} size={Math.round(size * 0.66)} strokeWidth={1.8} />
      ) : (
        Array.from(title.trim())[0]?.toLocaleUpperCase() || '?'
      )}
    </span>
  );
}
