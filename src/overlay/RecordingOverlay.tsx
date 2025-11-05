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
  const [levels, setLevels] = useState<number[]>(Array(16).fill(0));
  const [transcriptionProgress, setTranscriptionProgress] = useState(0);
  const smoothedLevelsRef = useRef<number[]>(Array(16).fill(0));

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

        // Apply smoothing to reduce jitter
        const smoothed = smoothedLevelsRef.current.map((prev, i) => {
          const target = newLevels[i] || 0;
          return prev * 0.7 + target * 0.3; // Smooth transition
        });

        smoothedLevelsRef.current = smoothed;

        // Create 17 bars (odd number) by duplicating center for perfect symmetry
        const centerIndex = 8; // Center of 16 bars (0-15)
        const bars17 = [
          ...smoothed.slice(0, centerIndex),
          smoothed[centerIndex], // Duplicate center
          ...smoothed.slice(centerIndex)
        ];
        setLevels(bars17); // Display 17 bars for odd-numbered symmetry
      });

      // Listen for transcription-progress updates
      const unlistenProgress = await listen<number>(
        "transcription-progress",
        (event) => {
          setTranscriptionProgress(event.payload as number);
        }
      );

      // Cleanup function
      return () => {
        unlistenShow();
        unlistenHide();
        unlistenLevel();
        unlistenProgress();
      };
    };

    setupEventListeners();
  }, []);

  // Reset progress when switching to recording state
  useEffect(() => {
    if (state === "recording") {
      setTranscriptionProgress(0);
    }
  }, [state]);

  // Center-wave effect: bars in the center react first to quiet sounds
  const getCenterWaveCoefficient = (index: number, totalBars: number): number => {
    const center = (totalBars - 1) / 2;
    const distanceFromCenter = Math.abs(index - center);
    // ULTRA aggressive exponential falloff: ONLY center bars (7-8-9) react to quiet sounds
    return Math.max(0.02, 1.0 - Math.pow(distanceFromCenter / center, 10.0) * 0.98);
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
              const maskedValue = v * waveCoeff; // Apply center-wave mask
              const height = Math.min(26, (3 + Math.pow(maskedValue * 2.5, 0.6) * 14) * 1.4); // Compact: max 26px
              const opacity = Math.max(0.3, Math.min(1, maskedValue * 2.5));

              return (
                <div
                  key={i}
                  className="bar"
                  style={{
                    height: `${height}px`,
                    transition: "height 60ms ease-out, opacity 120ms ease-out",
                    opacity: opacity,
                  }}
                />
              );
            })}
          </div>
        )}
        {state === "transcribing" && (
          <div className="transcribing-container">
            <div className="transcribing-text">
              Transcribing... {Math.round(transcriptionProgress * 100)}%
            </div>
            <div className="progress-bar-track">
              <div
                className="progress-bar-fill"
                style={{ width: `${transcriptionProgress * 100}%` }}
              />
            </div>
          </div>
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
