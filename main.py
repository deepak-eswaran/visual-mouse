from __future__ import annotations

import json
import math
import time
import webbrowser
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
import pyautogui

ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "settings.json"
SHOWROOM_PATH = ROOT / "showroom" / "index.html"

pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.005

DEFAULTS = {
    "camera_index": 0,
    "mirror_camera": True,
    "screen_margin": 0.08,
    "smoothing": 0.28,
    "pinch_start_ratio": 0.34,
    "pinch_release_ratio": 0.48,
    "gesture_hold_seconds": 0.45,
    "double_click_cooldown": 0.9,
    "scroll_sensitivity": 2.0,
    "show_camera_window": True,
    "move_when_open_hand": True
}

def load_settings():
    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        return {**DEFAULTS, **data}
    except Exception:
        return DEFAULTS.copy()

def clamp(v, low, high):
    return max(low, min(high, v))

def distance(a, b):
    return math.hypot(a.x - b.x, a.y - b.y)

def finger_up(lm, tip, pip):
    # MediaPipe image coordinates have y increasing downward.
    return lm[tip].y < lm[pip].y

def raised_fingers(lm):
    # Four fingers; thumb is excluded because its orientation depends on hand rotation.
    return sum([
        finger_up(lm, 8, 6),
        finger_up(lm, 12, 10),
        finger_up(lm, 16, 14),
        finger_up(lm, 20, 18),
    ])

def main():
    cfg = load_settings()
    screen_w, screen_h = pyautogui.size()
    margin = float(cfg["screen_margin"])
    smoothing = float(cfg["smoothing"])
    camera_index = int(cfg["camera_index"])

    cap = cv2.VideoCapture(camera_index, cv2.CAP_DSHOW)
    if not cap.isOpened():
        cap = cv2.VideoCapture(camera_index)
    if not cap.isOpened():
        print(f"ERROR: Could not open camera index {camera_index}. Edit settings.json and try 1.")
        input("Press Enter to exit...")
        return

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    cap.set(cv2.CAP_PROP_FPS, 30)

    # MediaPipe Hands is part of MediaPipe 0.10.21 (pinned in requirements).
    mp_hands = mp.solutions.hands
    mp_draw = mp.solutions.drawing_utils
    hands = mp_hands.Hands(
        static_image_mode=False,
        max_num_hands=1,
        model_complexity=1,
        min_detection_confidence=0.65,
        min_tracking_confidence=0.60
    )

    print("\nHoloHand Virtual Mouse starting...")
    print("Opening the local 3D sneaker showroom in your browser.")
    print("Hotkeys: Q = quit | C = recalibrate | SPACE = pause/resume | M = mirror toggle")
    print("Safety: move the cursor to the TOP-LEFT corner to trigger PyAutoGUI fail-safe.\n")
    try:
        webbrowser.open(SHOWROOM_PATH.as_uri())
    except Exception as exc:
        print("Could not automatically open showroom:", exc)
        print("Open this file manually:", SHOWROOM_PATH)

    cursor_x, cursor_y = screen_w / 2, screen_h / 2
    last_scroll_y = None
    pinch_active = False
    pinch_started_at = 0.0
    last_double_click = 0.0
    three_finger_since = None
    paused = False
    mirror = bool(cfg["mirror_camera"])
    frame_count = 0
    fps = 0.0
    fps_t0 = time.time()
    fps_frames = 0
    status = "SHOW YOUR HAND"
    status_until = 0.0
    calibration = None
    last_click_time = 0.0
    prev_pinch = False

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                status = "CAMERA FRAME UNAVAILABLE"
                continue

            if mirror:
                frame = cv2.flip(frame, 1)

            h, w = frame.shape[:2]
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = hands.process(rgb)
            frame_count += 1
            fps_frames += 1
            now = time.time()
            if now - fps_t0 >= 0.5:
                fps = fps_frames / (now - fps_t0)
                fps_frames, fps_t0 = 0, now

            hand_found = bool(result.multi_hand_landmarks)
            if hand_found:
                hand = result.multi_hand_landmarks[0]
                lm = hand.landmark
                mp_draw.draw_landmarks(frame, hand, mp_hands.HAND_CONNECTIONS)

                # Use thumb-index distance normalized by palm width to adapt to camera distance.
                palm_width = max(distance(lm[5], lm[17]), 0.025)
                pinch_ratio = distance(lm[4], lm[8]) / palm_width
                pinch_start = float(cfg["pinch_start_ratio"])
                pinch_release = float(cfg["pinch_release_ratio"])
                is_pinching = pinch_ratio < (pinch_release if pinch_active else pinch_start)

                # Index tip maps to screen coordinates. Margins prevent reaching the camera edge.
                ix, iy = lm[8].x, lm[8].y
                if calibration:
                    x0, y0, x1, y1 = calibration
                else:
                    x0, y0, x1, y1 = margin, margin, 1.0 - margin, 1.0 - margin
                nx = clamp((ix - x0) / max(x1 - x0, 0.01), 0.0, 1.0)
                ny = clamp((iy - y0) / max(y1 - y0, 0.01), 0.0, 1.0)
                target_x = nx * screen_w
                target_y = ny * screen_h
                cursor_x = cursor_x + (target_x - cursor_x) * smoothing
                cursor_y = cursor_y + (target_y - cursor_y) * smoothing

                count_up = raised_fingers(lm)
                # Dedicated three-finger shortcut: index, middle, ring up; pinky down.
                three_pose = (
                    finger_up(lm, 8, 6)
                    and finger_up(lm, 12, 10)
                    and finger_up(lm, 16, 14)
                    and not finger_up(lm, 20, 18)
                    and pinch_ratio > 0.65
                )

                # Two-finger scroll: index + middle up, ring + pinky down.
                scroll_pose = (
                    finger_up(lm, 8, 6) and finger_up(lm, 12, 10)
                    and not finger_up(lm, 16, 14) and not finger_up(lm, 20, 18)
                    and not is_pinching
                )

                # Gesture: hold three-finger pose briefly to double-click once.
                if three_pose:
                    if three_finger_since is None:
                        three_finger_since = now
                    elif (now - three_finger_since >= float(cfg["gesture_hold_seconds"])
                          and now - last_double_click >= float(cfg["double_click_cooldown"])):
                        pyautogui.moveTo(int(cursor_x), int(cursor_y), _pause=False)
                        pyautogui.doubleClick(interval=0.08)
                        last_double_click = now
                        three_finger_since = None
                        status, status_until = "DOUBLE CLICK", now + 0.75
                else:
                    three_finger_since = None

                if scroll_pose:
                    if last_scroll_y is not None:
                        dy = last_scroll_y - lm[12].y
                        if abs(dy) > 0.006:
                            amount = int(clamp(dy * 1200 * float(cfg["scroll_sensitivity"]), -8, 8))
                            if amount:
                                pyautogui.scroll(amount)
                    last_scroll_y = lm[12].y
                    status = "SCROLL MODE"
                else:
                    last_scroll_y = None

                # Keep cursor responsive during normal movement and while pinching to drag.
                if not paused and (cfg.get("move_when_open_hand", True) or is_pinching):
                    pyautogui.moveTo(int(clamp(cursor_x, 0, screen_w - 1)),
                                     int(clamp(cursor_y, 0, screen_h - 1)), _pause=False)

                # Pinch starts a held mouse press. Moving while held drags objects / rotates 3D.
                if not paused:
                    if is_pinching and not pinch_active:
                        pinch_active = True
                        pinch_started_at = now
                        pyautogui.mouseDown()
                        status, status_until = "GRAB / PRESS", now + 0.5
                    elif not is_pinching and pinch_active:
                        pyautogui.mouseUp()
                        pinch_active = False
                        duration = now - pinch_started_at
                        if duration < 0.28 and now - last_click_time > 0.12:
                            status, status_until = "CLICK", now + 0.45
                            last_click_time = now
                        else:
                            status, status_until = "RELEASE", now + 0.45

                # HUD markers.
                px, py = int(lm[8].x * w), int(lm[8].y * h)
                cv2.circle(frame, px and (px, py) or (px, py), 10, (255, 220, 60), -1)
                cv2.circle(frame, (px, py), 18, (255, 220, 60), 2)
                thumb = (int(lm[4].x * w), int(lm[4].y * h))
                cv2.line(frame, thumb, (px, py), (80, 220, 255), 2)
                cv2.putText(frame, f"PINCH {pinch_ratio:.2f}", (20, h - 66),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.62,
                            (80, 220, 255) if is_pinching else (190, 200, 215), 2)
                cv2.putText(frame, f"FINGERS {count_up}", (20, h - 38),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.62, (190, 200, 215), 2)
            else:
                if pinch_active:
                    pyautogui.mouseUp()
                    pinch_active = False
                three_finger_since = None
                last_scroll_y = None
                status = "SHOW YOUR HAND"

            # Futuristic camera HUD.
            cv2.rectangle(frame, (12, 12), (w - 12, 76), (12, 20, 34), -1)
            cv2.rectangle(frame, (12, 12), (w - 12, 76), (70, 210, 255), 1)
            cv2.putText(frame, "HOLOHAND  //  VIRTUAL MOUSE", (28, 39),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.72, (230, 245, 255), 2)
            mode_text = "PAUSED" if paused else ("PINCH HELD" if pinch_active else "TRACKING")
            cv2.putText(frame, f"{mode_text}  |  {fps:0.0f} FPS  |  MIRROR {'ON' if mirror else 'OFF'}",
                        (28, 63), cv2.FONT_HERSHEY_SIMPLEX, 0.46, (80, 220, 255), 1)

            if now < status_until:
                cv2.putText(frame, status, (w - 300, h - 30),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.75, (80, 240, 180), 2)
            elif hand_found:
                cv2.putText(frame, status, (w - 300, h - 30),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.65, (190, 200, 215), 2)

            # Compact gesture legend.
            legend = [
                "INDEX = MOVE CURSOR",
                "THUMB + INDEX PINCH = CLICK / DRAG",
                "3 FINGERS (HOLD) = DOUBLE CLICK",
                "INDEX + MIDDLE = SCROLL",
                "C = CALIBRATE   SPACE = PAUSE   M = MIRROR   Q = QUIT"
            ]
            y = 112
            for line in legend:
                cv2.putText(frame, line, (22, y), cv2.FONT_HERSHEY_SIMPLEX,
                            0.45, (185, 205, 225), 1, cv2.LINE_AA)
                y += 25

            if cfg.get("show_camera_window", True):
                cv2.imshow("HoloHand | Camera & Gesture HUD", frame)

            key = cv2.waitKey(1) & 0xFF
            if key in (ord('q'), ord('Q'), 27):
                break
            elif key == ord(' '):
                paused = not paused
                if paused and pinch_active:
                    pyautogui.mouseUp()
                    pinch_active = False
                status = "PAUSED" if paused else "TRACKING"
            elif key in (ord('m'), ord('M')):
                mirror = not mirror
            elif key in (ord('c'), ord('C')):
                # A simple centered working area; the HUD confirms calibration.
                calibration = (0.12, 0.10, 0.88, 0.90)
                status, status_until = "CALIBRATED WORK AREA", now + 1.2

    except pyautogui.FailSafeException:
        print("\nPyAutoGUI fail-safe triggered (cursor reached top-left).")
    finally:
        try:
            pyautogui.mouseUp()
        except Exception:
            pass
        cap.release()
        hands.close()
        cv2.destroyAllWindows()
        print("HoloHand stopped.")

if __name__ == "__main__":
    main()
