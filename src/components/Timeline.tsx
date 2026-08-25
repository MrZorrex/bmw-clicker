import { motion } from "framer-motion";
import { ERAS, MODELS } from "../data/game";

interface TimelineProps {
  modelIndex: number;
}

export default function Timeline({ modelIndex }: TimelineProps) {
  const currentEra = MODELS[modelIndex].era;
  const currentEraIdx = ERAS.indexOf(currentEra);

  return (
    <div className="border-b border-line bg-night/60">
      <div className="mx-auto max-w-[1600px] px-4 py-2.5 sm:px-6">
        <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
          <span>
            Коллекция{" "}
            <span className="text-white/80">
              {modelIndex + 1}<span className="text-white/40">/{MODELS.length}</span>
            </span>
          </span>
          <span>
            Эпоха: <span className="text-bmw-soft">{currentEra}</span>
          </span>
        </div>

        {/* Полоса десятилетий */}
        <div className="relative">
          <div className="flex gap-1">
            {ERAS.map((era, eraIdx) => {
              const count = MODELS.filter((m) => m.era === era).length;
              const owned = MODELS.filter((m) => m.era === era && MODELS.indexOf(m) <= modelIndex).length;
              const empty = count === 0;
              const active = era === currentEra;
              // эпоха пройдена: все модели куплены ИЛИ (пустая эпоха и мы уже дальше по времени)
              const passedEmpty = empty && eraIdx < currentEraIdx;
              const done = (count > 0 && owned === count) || passedEmpty;
              return (
                <div
                  key={era}
                  className="group relative flex-1"
                  title={
                    empty
                      ? `${era}: война — гражданское производство остановлено${passedEmpty ? " (пройдено)" : ""}`
                      : `${era}: ${owned}/${count}`
                  }
                >
                  <div
                    className={`h-1.5 overflow-hidden rounded-full transition-colors ${
                      done
                        ? passedEmpty
                          ? "bg-bmw/70"
                          : "bg-bmw"
                        : active
                          ? "bg-white/10"
                          : owned > 0
                            ? "bg-bmw/50"
                            : empty
                              ? "bg-white/5"
                              : "bg-white/10"
                    }`}
                  >
                    {active && !done && count > 0 && (
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-bmw to-bmw-soft"
                        initial={{ width: "0%" }}
                        animate={{ width: `${(owned / count) * 100}%` }}
                        transition={{ type: "spring", stiffness: 140, damping: 20 }}
                      />
                    )}
                  </div>
                  <div
                    className={`mt-1 truncate text-center text-[8.5px] font-bold tracking-wider transition-colors sm:text-[9px] ${
                      active
                        ? "text-bmw-soft"
                        : done
                          ? "text-white/45"
                          : empty
                            ? "text-white/15"
                            : "text-white/30"
                    }`}
                  >
                    {era.replace("-е", "")}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
