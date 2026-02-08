// Reference files, in order for intellisense to work with babylon functions and types
/// <reference path="babylon.d.ts" />
/// <reference path="babylon.gui.d.ts" />

"use strict"; // strict mode to guarantee better coding

// HTML elements (divs) for the render canvas, and for the fps counter
var canvas = document.getElementById("renderCanvas");

// Frame time recording
let frameTimeData = [];
let lastFrameDataLog = performance.now();
const frameDataLogInterval = 10000; // Log and clear data every 10 seconds

// Global variables for the base app
var meshes = []; // List of currently loaded meshes
var activeMeshIndex; // Index (in meshes array) of most recently rendered mesh

var menuButton; // Menu button, needs to be global so that all buttons can enable it on click.
var mapMenu, mapViewport, mapContent, mapPins, mapImage; // HTML map UI elements
var camera3D; // Babylon Camera for mesh screen (3D)
var performanceMode = true; // Indicates if lighter versions of the meshes should be used (for lower end computers)
var currentLoadResult = null; // Tracks assets from the last model load so we can dispose them

import MeasurementTool from "./measurementTool.js";

// Optimization function for large meshes
function optimizeMesh(mesh) {
	const meshesToOptimize = mesh.getChildMeshes().length > 0 ? mesh.getChildMeshes() : [mesh];
	
	meshesToOptimize.forEach(childMesh => {
		if (!childMesh.getTotalVertices || childMesh.getTotalVertices() === 0) return; // Skip if not a mesh with geometry

		childMesh.alwaysSelectAsActiveMesh = false; // Allow frustum culling
		childMesh.freezeWorldMatrix(); // Freeze world matrix as mesh doesn't move
		childMesh.doNotSyncBoundingInfo = true; // Don't sync bounding info every frame
		
		if (childMesh.material) childMesh.material.freeze(); // Freeze materials to avoid recompilation
	});
	
	// Apply more aggressive culling
	mesh.cullingStrategy = BABYLON.AbstractMesh.CULLINGSTRATEGY_BOUNDINGSPHERE_ONLY;
	
	// Ensure the mesh updates its bounding info once
	mesh.refreshBoundingInfo();
	mesh.freezeWorldMatrix();
}

function disposeLoadedAssets() {
	if (!currentLoadResult) return;

	currentLoadResult.transformNodes?.forEach(node => node.dispose());
	currentLoadResult.meshes?.forEach(mesh => mesh.dispose(false, true));
	currentLoadResult = null;
}

var createScene = async function () {
	// Creation of the scene
	var scene = new BABYLON.Scene(engine);

	scene.blockMaterialDirtyMechanism = true; // Prevent material updates unless explicitly needed

	// Arc Rotate Camera for looking at the meshes, which can be panned, zoomed and rotated
	camera3D = new BABYLON.ArcRotateCamera("camera",
		BABYLON.Tools.ToRadians(90), // starts at longitudinal angle 90
		BABYLON.Tools.ToRadians(90), // starts at latitudinal angle 90
		12, // starts at a distance of 12 units
		BABYLON.Vector3.Zero(), // initial pivot is the origin
		scene);
	camera3D.wheelPrecision = 50; // slows down the zooming (mouse wheel) by a factor of 50
	camera3D.detachControl(canvas);
	scene.activeCamera = camera3D;

	// Basic light source, shining down
	var light = new BABYLON.HemisphericLight("lightSource", new BABYLON.Vector3(0, 1, 0), scene);

	////////////////////////////
	// Map Menu Configuration //
	////////////////////////////

	mapMenu = document.getElementById("mapMenu");
	mapViewport = document.getElementById("mapViewport");
	mapContent = document.getElementById("mapContent");
	mapPins = document.getElementById("mapPins");
	mapImage = document.getElementById("mapImage");

	const setMapMenuVisible = (visible) => {
		if (!mapMenu) return;
		mapMenu.classList.toggle("is-hidden", !visible);
	};
	const setMapInteractable = (enabled) => {
		if (!mapMenu) return;
		mapMenu.classList.toggle("is-disabled", !enabled);
	};

	let mapScale = 0.7;
	let mapOffset = { x: 0, y: 0 };
	let mapDragging = false;
	let dragStart = { x: 0, y: 0 };
	let mapStartOffset = { x: 0, y: 0 };

	const applyMapTransform = () => {
		if (!mapContent) return;
		mapContent.style.transform = `translate(${mapOffset.x}px, ${mapOffset.y}px) scale(${mapScale})`;
	};

	const resetMapView = () => {
		if (!mapViewport || !mapImage) return;
		const viewportRect = mapViewport.getBoundingClientRect();
		const imageWidth = mapImage.naturalWidth || mapImage.width;
		const imageHeight = mapImage.naturalHeight || mapImage.height;
		if (!imageWidth || !imageHeight) return;

		if (mapContent) {
			mapContent.style.width = `${imageWidth}px`;
			mapContent.style.height = `${imageHeight}px`;
		}
		if (mapPins) {
			mapPins.style.width = `${imageWidth}px`;
			mapPins.style.height = `${imageHeight}px`;
		}

		const fitScale = Math.min(viewportRect.width / imageWidth, viewportRect.height / imageHeight);
		mapScale = Math.max(0.4, fitScale * 0.9);
		mapOffset = {
			x: (viewportRect.width - imageWidth * mapScale) / 2,
			y: (viewportRect.height - imageHeight * mapScale) / 2
		};
		applyMapTransform();
	};

	if (mapViewport) {
		mapViewport.addEventListener("pointerdown", (event) => {
			mapDragging = true;
			dragStart = { x: event.clientX, y: event.clientY };
			mapStartOffset = { x: mapOffset.x, y: mapOffset.y };
			mapViewport.classList.add("is-dragging");
			mapViewport.setPointerCapture(event.pointerId);
		});

		mapViewport.addEventListener("pointermove", (event) => {
			if (!mapDragging) return;
			const dx = event.clientX - dragStart.x;
			const dy = event.clientY - dragStart.y;
			mapOffset = { x: mapStartOffset.x + dx, y: mapStartOffset.y + dy };
			applyMapTransform();
		});

		const stopDrag = (event) => {
			if (!mapDragging) return;
			mapDragging = false;
			mapViewport.classList.remove("is-dragging");
			if (event && mapViewport.hasPointerCapture(event.pointerId)) {
				mapViewport.releasePointerCapture(event.pointerId);
			}
		};

		mapViewport.addEventListener("pointerup", stopDrag);
		mapViewport.addEventListener("pointerleave", stopDrag);

		mapViewport.addEventListener("wheel", (event) => {
			event.preventDefault();
			const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
			mapScale = Math.min(3, Math.max(0.2, mapScale * zoomFactor));
			applyMapTransform();
		}, { passive: false });
	}

	if (mapImage) {
		if (mapImage.complete) {
			resetMapView();
		} else {
			mapImage.addEventListener("load", resetMapView, { once: true });
		}
	}

	window.addEventListener("resize", resetMapView);

	// Helper to load JSON file
	async function loadSceneInfo() {
		const response = await fetch("./scenes.json");
		if (!response.ok) {
			console.error("Failed to load scenes.json");
			return [];
		}
		return await response.json();
	}

	const createMapPin = (meshName, uvx, uvy, meshOperations) => {
		let index = meshes.length;
		meshes.push(null);

		if (!mapPins) return;
		const pin = document.createElement("button");
		pin.type = "button";
		pin.className = "map-pin";
		pin.style.left = `${uvx * 100}%`;
		pin.style.top = `${(1 - uvy) * 100}%`;
		pin.setAttribute("aria-label", meshName);
		pin.addEventListener("pointerdown", (event) => event.stopPropagation());

		pin.addEventListener("click", () => {
			document.getElementById("loadingScreen").style.display = "block";
			document.getElementById("loadingScreenText").innerText = "0%";

			setMapMenuVisible(false);
			setMapInteractable(false);

			activeMeshIndex = index;

			disposeLoadedAssets();
			if (meshes[index] != null) {
				meshes[index].dispose(false, true);
				meshes[index] = null;
			}

			console.time("Loading " + meshName);
			console.log("Start loading of " + meshName);
			engine.displayLoadingUI();

			let meshPath = "./meshes/" + meshName;
			if (performanceMode) meshPath += "Light";
			meshPath += ".glb";

			BABYLON.SceneLoader.ImportMeshAsync("", meshPath, "", scene, (evt) => {
				if (evt.lengthComputable) {
					let loadedPercent = ((evt.loaded * 100) / evt.total).toFixed();
					document.getElementById("loadingScreenText").innerText = loadedPercent + "%";
				}
			}).then(function (result) {
				currentLoadResult = result;
				if(result.meshes[0].name === "__root__" && result.meshes[0].getChildMeshes().length === 1) {
					meshes[index] = result.meshes[0].getChildMeshes()[0];
				} else {
					meshes[index] = result.meshes[0];
				}

				if(typeof meshOperations !== "undefined") meshOperations(meshes[index]);
				console.timeEnd("Loading " + meshName);
				engine.hideLoadingUI();
				document.getElementById("loadingScreen").style.display = "none";

				optimizeMesh(meshes[index]);
			});

			if (menuButton) menuButton.classList.add("is-visible");
			MeasurementTool.showButton();

			camera3D.attachControl(canvas, true);
			scene.activeCamera = camera3D;
		});

		mapPins.appendChild(pin);
	};

	const sceneInfos = await loadSceneInfo();
	sceneInfos.forEach(info => {
		createMapPin(info.name, info.uvx, info.uvy, function(mesh) {
			if (typeof mesh !== "undefined" && typeof info.scale === "number") {
				MeasurementTool.setScale(info.scale);
			}
		});
	});

	/////////////////////////
	// WebXR Configuration //
	/////////////////////////
/*
	// Initializes WebXR in VR (immersive-vr mode)
	const xrHelper = await scene.createDefaultXRExperienceAsync({
		disableTeleportation: true, // Disable teleportation so we can use movement
	});

	const xrCamera = xrHelper.baseExperience.camera;

	const featureManager = xrHelper.baseExperience.featuresManager;

	var cameraYMovement = 0;

	// Swaps the configuration for the two hands, making it so that left is movement and right is rotation
	const swappedHandednessConfiguration = [
		{
			// Right stick configuration
			allowedComponentTypes: [BABYLON.WebXRControllerComponent.THUMBSTICK_TYPE, BABYLON.WebXRControllerComponent.TOUCHPAD_TYPE],
			forceHandedness: "right",
			axisChangedHandler: (axes, movementState, featureContext, xrInput) => {
				// Apply axes to rotation if above threshold
				movementState.rotateX = Math.abs(axes.x) > featureContext.rotationThreshold ? axes.x : 0;
				//movementState.rotateY = Math.abs(axes.y) > featureContext.rotationThreshold ? axes.y : 0; // disable? does not seem to work anyways
				cameraYMovement = Math.abs(axes.y) > featureContext.rotationThreshold ? -axes.y : 0;
			},
		},
		{
			// Left stick configuration
			allowedComponentTypes: [BABYLON.WebXRControllerComponent.THUMBSTICK_TYPE, BABYLON.WebXRControllerComponent.TOUCHPAD_TYPE],
			forceHandedness: "left",
			axisChangedHandler: (axes, movementState, featureContext, xrInput) => {
				// Apply axes to movement if above threshold
				movementState.moveX = Math.abs(axes.x) > featureContext.movementThreshold ? axes.x : 0;
				movementState.moveY = Math.abs(axes.y) > featureContext.movementThreshold ? axes.y : 0;
			},
		},
	];

	const movementFeature = featureManager.enableFeature(BABYLON.WebXRFeatureName.MOVEMENT, "latest", {
		xrInput: xrHelper.input,
		movementSpeed: 0.1,
		rotationSpeed: 0.4,
		customRegistrationConfigurations: swappedHandednessConfiguration,
	});

	// Camera Y Movement each frame based on the right stick vertical axis
	scene.onBeforeRenderObservable.add(() => {
		if(!xrCamera || !movementFeature) return;

		if(cameraYMovement != 0) {
			// Inspired by internal BabylonJS code for the movement feature
			let yMovement = new BABYLON.Vector3(0, cameraYMovement, 0);
			yMovement.scaleInPlace(xrCamera._computeLocalCameraSpeed() * movementFeature.movementSpeed);
			xrCamera.cameraDirection.addInPlace(yMovement);
		}
	});

	*/

	///////////////////
	// UI of the app //
	///////////////////

	// UI Base for measurement tool lines
	var advancedTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");

	// UI Elements

	// Menu button configuration
	menuButton = document.getElementById("backToMenuButton");

	// On Click behaviour for the menu button
	if (menuButton) menuButton.addEventListener("click", () => {
		setMapInteractable(true);
		setMapMenuVisible(true);

		// Hide 3D view UI and disable measurements
		menuButton.classList.remove("is-visible");
		MeasurementTool.hideButton();
		MeasurementTool.disable();
		MeasurementTool.resetScale();

		// Dispose all meshes and assets when returning to menu
		activeMeshIndex = null;
		disposeLoadedAssets();
		for (let i = 0; i < meshes.length; ++i) {
			if (meshes[i] != null) {
				meshes[i].dispose(false, true);
				meshes[i] = null;
			}
		}

		// Detach 3D camera controls on menu screen
		camera3D.detachControl(canvas);
	});

	////////////////////////////////////////////////////////////////////////////////////

	// Initializing measurement tool //
	await MeasurementTool.init(scene, advancedTexture);

	// Allows access to the debug mode of BabylonJS, including an inspector.
	// Convenient for debugging.
	// scene.debugLayer.show();
    
	return scene;
};

// Creation of the Babylon Engine
var engine = new BABYLON.Engine(canvas, true, { 
	preserveDrawingBuffer: true, 
	stencil: true,
	powerPreference: "high-performance",
});
engine.disablePerformanceMonitorInBackground = true;

var scene;

// Create scene asynchronously, then when it's ready, define render loop to render the frames of the scene
createScene().then((loadedScene) => {
	scene = loadedScene;
	
	let nextFpsUpdate = 0;
	const fpsUpdateInterval = 250; // Update FPS display every Xms instead of every frame to avoid constant DOM updates

	engine.runRenderLoop(function () {
		const frameStart = performance.now();
		loadedScene.render(); // Render the frame in the scene
		const frameEnd = performance.now();
		const now = frameEnd;
		
		// Record frame time
		if (now > nextFpsUpdate) {
			frameTimeData.push({
				frameTime: frameEnd - frameStart,
				fps: engine.getFps()
			});
			//divFps.textContent = engine.getFps().toFixed() + " FPS"; // Update the FPS counter
			nextFpsUpdate = now + fpsUpdateInterval;

			// Log and clear frame data every 10 seconds
			if (now - lastFrameDataLog > frameDataLogInterval) {
				console.log(frameTimeData);
				
				// Calculate and log statistics
				const avgFrameTime = frameTimeData.reduce((sum, d) => sum + d.frameTime, 0) / frameTimeData.length;
				const avgFps = frameTimeData.reduce((sum, d) => sum + d.fps, 0) / frameTimeData.length;
				const minFrameTime = Math.min(...frameTimeData.map(d => d.frameTime));
				const maxFrameTime = Math.max(...frameTimeData.map(d => d.frameTime));
				
				console.log(`Stats - Avg Frame Time: ${avgFrameTime.toFixed(2)}ms, Avg FPS: ${avgFps.toFixed(1)}, Min: ${minFrameTime.toFixed(2)}ms, Max: ${maxFrameTime.toFixed(2)}ms`);
				
				// Clear the array
				frameTimeData = [];
				lastFrameDataLog = now;
			}
		}
	});
});

// Resize when necessary
window.addEventListener("resize", function () {
	engine.resize();
});
