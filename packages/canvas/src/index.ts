/**
 * @opencodex/canvas: components for agent-written canvases. Everything follows the
 * OpenCodex theme, including light/dark switches, so canvases never set their own colors
 * for standard UI. Custom elements can use the theme's CSS variables: --text,
 * --text-secondary, --text-tertiary, --surface, --elevated, --border, --border-heavy,
 * --hover, --code-bg, --font-sans, --font-mono, and the palette --cv-blue, --cv-green,
 * --cv-orange, --cv-purple, --cv-pink, --cv-yellow, --cv-red, --cv-gray.
 */
export { useData, useColorScheme } from './store';
export {
  Stack,
  Row,
  Grid,
  Card,
  Section,
  Divider,
  Tabs,
  Tab,
  Title,
  Heading,
  Text,
  Code,
  CodeBlock,
} from './layout';
export {
  Badge,
  Callout,
  Stat,
  KeyValue,
  Progress,
  List,
  Timeline,
  TaskList,
  Table,
  DiffView,
  Empty,
  type Column,
  type TaskStatus,
} from './display';
export {
  Button,
  TextInput,
  TextArea,
  NumberInput,
  Select,
  SegmentedControl,
  Checkbox,
  Switch,
  Slider,
} from './inputs';
export {
  BarChart,
  LineChart,
  AreaChart,
  PieChart,
  Sparkline,
  ScatterChart,
  Heatmap,
  type Series,
} from './charts';
export {
  AsciiDiagram,
  type DiagramSpec,
  type DiagramBox,
  type DiagramConnector,
  type DiagramPath,
  type DiagramText,
  type DiagramColor,
} from './ascii';
export { formatNumber, colorOf, type Format, type Tone, type Color } from './util';
