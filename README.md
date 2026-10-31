# HoloHand — Gesture 3D Studio

HoloHand now includes a browser-first 3D gallery that can be deployed as a static website. Visitors open the URL, select **Enable hand mode**, grant webcam permission, and control the gallery with gestures. The camera preview is docked inside the same webpage (bottom-right); it can be minimized, maximized, hidden, or stopped.

## Browser demo (recommended for sharing)

### Run locally on Windows
1. Extract the project.
2. Double-click `launch-web.bat`, or run the following from a terminal:
   ```powershell
   cd showroom
   py -m http.server 8000
   ```
3. Open `http://localhost:8000`.
4. Click **Enable hand mode** and allow camera access.

No Python packages, Node.js, or build step are required for the browser showroom. It uses Three.js and MediaPipe from pinned CDNs. An internet connection is needed.

### Hand gestures
- Point with index finger: move the virtual pointer and hover the page.
- Pinch thumb + index: pinch and move over the viewer to rotate; pinch and release over a UI control to activate it.
- Raise index + middle fingers (fold ring + little fingers): move up to zoom in, down to zoom out.
- Open palm: swipe left/right to switch through the collection.

The webcam is opt-in. The page requests permission only after the user presses Enable hand mode. Frames are processed locally in the browser. The site does not record or upload video. A browser camera preview appears in the page's bottom-right dock; users can minimize, maximize, hide the preview, or stop hand mode.

## Deploy on Vercel (UI only)

The deployable static site is the `showroom/` folder. Import the GitHub repository in Vercel and set **Root Directory** to `showroom`.

1. Create a new public GitHub repository, for example `holohand-gesture-studio`.
2. Use GitHub's **Add file → Upload files** to upload the extracted project contents, including the `showroom` folder. Commit with a message such as `Add HoloHand gesture 3D studio`.
3. Sign in to Vercel with GitHub.
4. Choose **Add New → Project**, then import `holohand-gesture-studio`.
5. On the Configure Project screen, set **Root Directory** to `showroom`.
6. Use **Other** as the Framework Preset. This is a plain static HTML/JavaScript site: no build command and no install command are needed. Keep the output directory at the default for the selected root (or `.` if Vercel requires a value).
7. Click **Deploy**. When it finishes, open the generated `.vercel.app` URL.
8. On the live HTTPS site, press **Enable hand mode** and allow camera access.

Vercel's Git integration automatically makes a new deployment when commits are pushed to the connected production branch (usually `main`). To update the website later, upload/commit the changed `showroom` files to GitHub; Vercel redeploys them.

## GitHub browser upload
- On GitHub, create the repository with **Add a README** unchecked because this project already contains a README.
- Open the empty repository, choose **Add file → Upload files**, and drag the extracted project contents (not the ZIP itself) into the page.
- Wait for the file list to finish uploading, enter a commit message, and select **Commit changes**.

## 3D assets and licensing
- Stormforged Hammer is an original procedural Norse-inspired object built in Three.js; it is not a copy of a specific film prop or branded character.
- Concept GT, Roadline, Skyframe, Meridian, and Aero Runner use GLB models published as CC0/public-domain assets by Innerscene. Source pages and license notes are listed in `showroom/ASSET_CREDITS.md`.
- GLB assets are loaded on demand from the source host. An internet connection is needed. If a remote GLB cannot be reached (for example, a future host/CORS change), a lightweight local fallback object is displayed.

## Existing desktop virtual mouse
The original Python/OpenCV/PyAutoGUI virtual mouse is retained in `main.py` and its pinned requirements. Run `run.bat` for that legacy desktop workflow; it opens a separate OpenCV camera window and is independent from the browser hand mode.

For the shareable website and embedded camera dock, use `launch-web.bat` locally or the Vercel deployment. Do not run `main.py` to launch the browser-only demo.

## Privacy and browser requirements
- Webcam access requires an explicit user action and permission.
- Camera access works on `localhost` for local testing and on HTTPS domains such as a Vercel deployment. It generally will not work when opening the HTML through `file://`.
- MediaPipe's runtime and model are downloaded from public CDNs on first enable; no video is sent to a server by this app.
- Tested source syntax and project structure; the real webcam and remote GLB loading still need to be tested in the target browser after deployment.
