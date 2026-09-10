import { ModelView } from './ModelScene';
export default function PrinterScene({ large = false }: { large?: boolean }) {
  return (
    <ModelView
      kind="printer"
      hero
      className={`printer-scene ${large ? 'large' : ''}`}
      label="Three-dimensional illustration of a Tobor 3D printer"
    />
  );
}
