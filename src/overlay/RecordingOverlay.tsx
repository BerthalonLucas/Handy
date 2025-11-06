import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import React, { useEffect, useRef, useState } from "react";
import {
  MicrophoneIcon,
  TranscriptionIcon,
  CancelIcon,
} from "../components/icons";
import "./RecordingOverlay.css";

type OverlayState = "recording" | "transcribing";

const RecordingOverlay: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [state, setState] = useState<OverlayState>("recording");
  const [levels, setLevels] = useState<number[]>([]);
  const smoothedLevelsRef = useRef<number[]>([]);

  useEffect(() => {
    const setupEventListeners = async () => {
      // Listen for show-overlay event from Rust
      const unlistenShow = await listen("show-overlay", (event) => {
        const overlayState = event.payload as OverlayState;
        setState(overlayState);
        setIsVisible(true);
      });

      // Listen for hide-overlay event from Rust
      const unlistenHide = await listen("hide-overlay", () => {
        setIsVisible(false);
      });

      // Listen for mic-level updates
      const unlistenLevel = await listen<number[]>("mic-level", (event) => {
        const newLevels = event.payload as number[];

        if (smoothedLevelsRef.current.length === 0) {
          smoothedLevelsRef.current = new Array(newLevels.length).fill(0);
        }

        const smoothed = newLevels.map((target, i) => {
          const prev = smoothedLevelsRef.current[i] || 0;
          return prev * 0.7 + target * 0.3;
        });

        smoothedLevelsRef.current = smoothed;

        const centerIndex = Math.floor(smoothed.length / 2);
        const barsWithCenter = [
          ...smoothed.slice(0, centerIndex),
          smoothed[centerIndex],
          ...smoothed.slice(centerIndex + 1)
        ];
        
        setLevels(barsWithCenter);
      });

      return () => {
        unlistenShow();
        unlistenHide();
        unlistenLevel();
      };
    };

    setupEventListeners();
  }, []);

  // Center-wave effect: bars in the center react first to quiet sounds
  const getCenterWaveCoefficient = (index: number, totalBars: number): number => {
    const center = (totalBars - 1) / 2;
    const distanceFromCenter = Math.abs(index - center);
    return Math.max(0.15, 1.0 - Math.pow(distanceFromCenter / center, 3.5) * 0.85);
  };

  const getIcon = () => {
    if (state === "recording") {
      return <MicrophoneIcon />;
    } else {
      return <TranscriptionIcon />;
    }
  };

  return (
    <div className={`recording-overlay ${isVisible ? "fade-in" : ""}`}>
      <div className={`overlay-left ${state === "transcribing" ? "icon-pulse-active" : ""}`}>{getIcon()}</div>

      <div className="overlay-middle">
        {state === "recording" && (
          <div className="bars-container">
            {levels.map((v, i) => {
              const waveCoeff = getCenterWaveCoefficient(i, levels.length);
              const maskedValue = v * waveCoeff;
              const height = Math.min(24, (2.5 + Math.pow(maskedValue * 4.0, 0.55) * 12.5) * 1.4);
              const opacity = Math.max(0.3, Math.min(1, maskedValue * 4.0));
              
              const pinkIntensity = Math.min(0.6, maskedValue * 1.2);
              const background = `linear-gradient(180deg,
                rgba(${255 - pinkIntensity * 100}, ${255 - pinkIntensity * 150}, ${255 - pinkIntensity * 80}, 0.9) 0%,
                rgba(${230 - pinkIntensity * 90}, ${230 - pinkIntensity * 130}, ${235 - pinkIntensity * 70}, 0.7) 100%)`;

              return (
                <div
                  key={i}
                  className="bar"
                  style={{
                    height: `${height}px`,
                    opacity: opacity,
                    background: background,
                  }}
                />
              );
            })}
          </div>
        )}
        {state === "transcribing" && (
          <div className="transcribing-text">Transcribing...</div>
        )}
      </div>

      <div className="overlay-right">
        {state === "recording" && (
          <div
            className="cancel-button"
            onClick={() => {
              invoke("cancel_operation");
            }}
          >
            <CancelIcon />
          </div>
        )}
      </div>
    </div>
  );
};

export default RecordingOverlay;
