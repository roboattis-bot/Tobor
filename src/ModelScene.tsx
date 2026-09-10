import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Box, CheckCheck, ClipboardList, Cog, Package, Printer, Wrench } from 'lucide-react';
import type { ModelEngine, ModelKind, ModelOptions } from './models/types';

const Context = createContext<{
  register: (element: HTMLElement, options: ModelOptions) => () => void;
  motion: boolean;
  toggleMotion: () => void;
}>({ register: () => () => {}, motion: true, toggleMotion: () => {} });
export function ModelSceneProvider({ children }: { children: ReactNode }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<ModelEngine | null>(null);
  const registry = useRef(new Map<HTMLElement, ModelOptions>());
  const [motion, setMotion] = useState(() => {
    try {
      return localStorage.getItem('tobor.motion') !== 'off';
    } catch {
      return true;
    }
  });
  const motionRef = useRef(motion);
  motionRef.current = motion;
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      import('./models/renderer')
        .then(({ createModelEngine }) => {
          if (cancelled || !canvas.current) return;
          try {
            const next = createModelEngine(canvas.current);
            engine.current = next;
            next.setMotion(motionRef.current);
            registry.current.forEach((options, element) => next.add(element, options));
          } catch {
            /* The fallback illustration leaves every control usable without WebGL. */
            canvas.current.dataset.status = 'fallback';
          }
        })
        .catch(() => {
          if (!cancelled && canvas.current) canvas.current.dataset.status = 'fallback';
        });
    }, 80);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      engine.current?.dispose();
      engine.current = null;
    };
  }, []);
  useEffect(() => {
    engine.current?.setMotion(motion);
    try {
      localStorage.setItem('tobor.motion', motion ? 'on' : 'off');
    } catch {
      /* Storage can be disabled. */
    }
  }, [motion]);
  const value = useMemo(
    () => ({
      register(element: HTMLElement, options: ModelOptions) {
        registry.current.set(element, options);
        engine.current?.add(element, options);
        return () => {
          registry.current.delete(element);
          engine.current?.remove(element);
        };
      },
      motion,
      toggleMotion: () => setMotion((previous) => !previous),
    }),
    [motion],
  );
  const register = useRef(value.register);
  return (
    <Context.Provider value={{ ...value, register: register.current }}>
      {children}
      <canvas ref={canvas} className="model-canvas" aria-hidden="true" />
    </Context.Provider>
  );
}
export const useModelMotion = () => useContext(Context);
const symbols = {
  workshop: Printer,
  printer: Printer,
  robot: Wrench,
  gear: Cog,
  bracket: Box,
  parcel: Package,
  check: CheckCheck,
  receipt: ClipboardList,
  blueprint: ClipboardList,
  library: Cog,
};
export function ModelView({
  kind,
  className = '',
  hero = false,
  label,
}: {
  kind: ModelKind;
  className?: string;
  hero?: boolean;
  label?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const { register } = useContext(Context);
  useEffect(
    () => (host.current ? register(host.current, { kind, hero }) : undefined),
    [register, kind, hero],
  );
  const Symbol = symbols[kind];
  return (
    <div
      ref={host}
      className={`model-view ${className}`}
      data-model={kind}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <div className="model-fallback">
        <Symbol size={48} strokeWidth={1.25} />
      </div>
    </div>
  );
}
