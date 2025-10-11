// Reference files, in order for intellisense to work with babylon functions and types
/// <reference path="babylon.d.ts" />
/// <reference path="babylon.gui.d.ts" />

"use strict"; // strict mode to guarantee better coding

// HTML elements (divs) for the render canvas, and for the fps counter
var canvas = document.getElementById("renderCanvas");
let divFps = document.getElementById("fps");

// Global variables for the base app
var meshes = []; // List of currently loaded meshes
var activeMeshIndex; // Index (in meshes array) of most recently rendered mesh

var menuButton; // Menu button, needs to be global so that all buttons can enable it on click.
var performanceModeCheckbox; // Toggles performance mode, global so it can be disabled when loading a model
var mapAdvancedTexture; // Advanced Texture (=GUI) on the map, containing the pins for each model
var mapPointerObserver; // Handles DragDrop on map screen, global so that it can be disabled in 3D view
var mapImagePlane, mapGuiPlane; // Planes for the map on the map screen, disabled on 3D view
var mapDragging = false; // Boolean indicating if click is being held on the map screen (i.e. whether you are dragging)
var camera2D, camera3D; // Babylon Cameras for the map screen (2D) and mesh screen (3D)
var performanceMode = true; // Indicates if lighter versions of the meshes should be used (for lower end computers)

import MeasurementTool from "./measurementTool.js";

// This function takes a name and a file, and creates a button in the menu with "name" as text
// that loads and displays the mesh pointed by "meshSource", which can be a filepath or URL.
function createPin(meshName, uvx, uvy, meshOperations) {
	// Allocates a space in the array to store the mesh in, once it's loaded (after button click)
	let index = meshes.length;
	meshes.push(null);
	
	var pin = new BABYLON.GUI.Image(undefined, "gui/pin.png");
    pin.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    pin.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;

    pin.width = "80px";
    pin.height = "80px";

	pin.left = (uvx - 0.5) * 100 + "%";
	pin.top = (0.5 - uvy) * 100 + "%";

	// When pin is loaded, move it up by half its height so that the tip is at the specified point
	pin.onImageLoadedObservable.add(() => {
		pin.topInPixels -= pin.heightInPixels / 2;
	});
	
	// Change cursor style based on state related to the pin
    pin.onPointerEnterObservable.add(() => canvas.style.cursor = "pointer");
    pin.onPointerOutObservable.add(() => canvas.style.cursor = mapDragging ? "grabbing" : "grab");

	pin.onPointerClickObservable.add(() => {
		// Hide the map screen, disable map input and cursor handling, disable performance mode button
        mapImagePlane.setEnabled(false);
        mapGuiPlane.setEnabled(false);
		mapPointerObserver.remove();
		scene.doNotHandleCursors = false;
		canvas.style.cursor = "default";
		performanceModeCheckbox.isVisible = false;

		activeMeshIndex = index;

		if(meshes[index] != null) {
			// If mesh is already loaded, reenable it
			meshes[index].setEnabled(true);
		} else {
			// If mesh isn't loaded, load it.
			// Load time is measured by console.time() and timeEnd()
			// The BabylonJS loading UI is shown during load (it can be configured)
			
			// Start timing and show load screen
			console.time("Loading " + meshName);
			console.log("Start loading of " + meshName);
			engine.displayLoadingUI();

			// Derive mesh path from the mesh name and performance mode
			let meshPath = "./meshes/" + meshName;
			if (performanceMode) meshPath += "Light";
			meshPath += ".glb";
			
			// Load the actual mesh asynchronously (returns a Promise)
			BABYLON.ImportMeshAsync(meshPath, scene).then(function (result) {
				// After load succeeds, put the mesh reference in the correct slot of the array
				if(result.meshes[0].name === "__root__" && result.meshes[0].getChildMeshes().length === 1) {
					// Meshes from .glb files have an empty __root__ mesh as parent, with the actual mesh as a child
					// If __root__ has only one child, save it and not __root__
					meshes[index] = result.meshes[0].getChildMeshes()[0];
				} else {
					// If it's not a .glb, or __root__ contains several meshes, just take the root mesh
					meshes[index] = result.meshes[0];
				}

				if(typeof meshOperations !== "undefined") meshOperations(meshes[index]); // Apply given operations to mesh, if any
				console.timeEnd("Loading " + meshName); // Stop timing (that also logs the time)
				engine.hideLoadingUI(); // hide the load screen

				// Mesh subdivision and octree creation to optimize picking
				// Has to be done after the mesh operations !
				if(meshes[index].getChildMeshes().length > 0) {
					// Create a maximum of 1000 total submeshes uniformly split between the children
					let nbSub = 1000 / meshes[index].getChildMeshes().length;
					//console.log(nbSub);
					meshes[index].getChildMeshes().forEach(child => {
						child.subdivide(Math.floor(nbSub));
						child.createOrUpdateSubmeshesOctree(64);
					});
				} else {
					// If no children, subdivide the mesh itself
					meshes[index].subdivide(1000);
					meshes[index].createOrUpdateSubmeshesOctree(64);
				}
			});
		}

		// Show measurement tool button and menu button
		menuButton.isVisible = true;
		MeasurementTool.showButton();

		// Reactivate 3D Camera
		camera2D.detachControl(canvas);
		camera3D.attachControl(canvas, true);
		scene.activeCamera = camera3D;
    });

	// Add the pin to UI, return it so that its properties can be changed if needed
	mapAdvancedTexture.addControl(pin);
	return pin;
}

var createScene = async function () {
	// Creation of the scene
    var scene = new BABYLON.Scene(engine);

	// For the map menu (2D view)
	camera2D = new BABYLON.UniversalCamera("camera2D", new BABYLON.Vector3(0, 0, -3), scene);
	camera2D.attachControl(canvas, true);
	// Disable mouse, keyboard and gamepad controls to prevent camera rotations and movement
	camera2D.inputs.attached.mouse.detachControl();
	camera2D.inputs.attached.keyboard.detachControl(); 
	camera2D.inputs.attached.gamepad.detachControl();

	// Arc Rotate Camera for looking at the meshes, which can be panned, zoomed and rotated
	camera3D = new BABYLON.ArcRotateCamera("camera",
											BABYLON.Tools.ToRadians(90), // starts at longitudinal angle 90
											BABYLON.Tools.ToRadians(90), // starts at latitudinal angle 90
											12, // starts at a distance of 12 units
											BABYLON.Vector3.Zero(), // initial pivot is the origin
											scene);
		//camera.wheelDeltaPercentage = 0.02; // slows down zooming. Has issues. wheelPrecision is better.
		camera3D.wheelPrecision = 50; // slows down the zooming (mouse wheel) by a factor of 50
		//camera3D.attachControl(canvas, true);

	// Basic light source, shining down
    var light = new BABYLON.HemisphericLight("lightSource", new BABYLON.Vector3(0, 1, 0), scene);

	////////////////////////////
	// Map Menu Configuration //
	////////////////////////////

	scene.doNotHandleCursors = true;
	canvas.style.cursor = "grab";

	var camera_min_z = -5;
	var camera_max_z = -1;
    var zoom_speed = 0.005;

	var mapTexture = new BABYLON.Texture("./gui/map.png", scene);
    var mapMaterial = new BABYLON.StandardMaterial("mapmaterial", scene);
    mapMaterial.diffuseTexture = mapTexture;
    mapMaterial.disableLighting = true;
    mapMaterial.emissiveColor = BABYLON.Color3.White();

	// Plane to hold the map texture
    mapImagePlane = BABYLON.MeshBuilder.CreatePlane("mapplane", {size: 1}, scene);
    mapImagePlane.material = mapMaterial;
    mapImagePlane.position.z = 0.01; // Slightly behind the origin to avoid Z-fighting with the UI

	// Putting an Advanced Dynamic Texture (= UI) on a mesh removes its textures, if any, so we need two separate planes to hold the map texture and the UI. This one will hold the UI.
    mapGuiPlane = BABYLON.MeshBuilder.CreatePlane("guiplane", {size: 1}, scene);

	// We need to wait for the texture to load so that we know its dimensions, in order to rescale the planes and setup the UI
	mapTexture.onLoadObservable.add(() => {
		// Get the dimensions of the image (only possible when load is over)
		let w = mapTexture.getSize().width;
		let h = mapTexture.getSize().height;
		
		// Calculate "normalized" size: the smallest dimension is 1 and the other is chosen to keep the ratio (e.g. a 600x400 image will have an xsize of 1.5 and ysize of 1)
		// Those are used for the dimensions of the planes
		let xsize = w > h ? w/h : 1;
		let ysize = w > h ? 1 : h/w;

		// Rescale the planes
		mapImagePlane.scaling = new BABYLON.Vector3(xsize, ysize, 1);
		mapGuiPlane.scaling = new BABYLON.Vector3(xsize, ysize, 1);

		// Create an ADT to hold the UI of the map, linked to the mesh
		// Its dimensions are proportional to the image to avoid stretching the UI, the 1024 factor is here to maintain consistent scaling no matter the image size (thanks to the normalization)
		// (Just using the image size as the dimensions, for example, would make the UI look bigger on smaller images)
		mapAdvancedTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(mapGuiPlane, 1024*xsize, 1024*ysize);

		/////// LIST OF MODELS AND THEIR LOCATION ON THE MAP

		// The pins need to be created after the advanced texture is created, because they attach to it
		createPin("Karydaki", 0.263, 0.107);
		createPin("Morosini", 0.399, 0.951);
		createPin("Caronissi", 0.222, 0.596);
		createPin("Silamos", 0.268, 0.268);
		createPin("Spilia", 0.422, 0.485);
		createPin("Bembo", 0.335, 0.951);
	});

    //add pointer functionality
	mapPointerObserver = scene.onPointerObservable.add((e)=>onPointerMapDragDrop(e));
    let mapCameraSpeed = 0.001;
	var mapObserverPos, mapObserverLastPos;

    function onPointerMapDragDrop(pointerInfo) {
  
        switch (pointerInfo.type) {
            case BABYLON.PointerEventTypes.POINTERDOWN:
                mapDragging = true;

                let uv = pointerInfo.pickInfo.getTextureCoordinates();
				console.log(uv);

                // change cursor except if on a pin
                if(engine.getRenderingCanvas().style.cursor != "pointer")
                    engine.getRenderingCanvas().style.cursor = "grabbing";
			break;
			case BABYLON.PointerEventTypes.POINTERUP:
                mapDragging = false;
                
                // change cursor except if on a pin
                if(engine.getRenderingCanvas().style.cursor != "pointer")
                    engine.getRenderingCanvas().style.cursor = "grab";
            break;
            case BABYLON.PointerEventTypes.POINTERMOVE:
                if(mapDragging){
                    mapObserverPos = new BABYLON.Vector2(scene.pointerX,scene.pointerY);
                    let xdir = mapObserverLastPos.x-mapObserverPos.x;
                    let ydir = mapObserverLastPos.y-mapObserverPos.y;
                    mapCameraSpeed = 0.001*-camera2D.position.z
                    camera2D._localDirection.copyFromFloats(mapCameraSpeed*xdir, mapCameraSpeed*-ydir, 0);
                    camera2D.getViewMatrix().invertToRef(camera2D._cameraTransformMatrix);
                    BABYLON.Vector3.TransformNormalToRef(camera2D._localDirection, camera2D._cameraTransformMatrix, camera2D._transformedDirection);
                    camera2D.position.addInPlace(camera2D._transformedDirection);
                }
            break;
            case BABYLON.PointerEventTypes.POINTERWHEEL:
                camera2D._localDirection.copyFromFloats(0, 0, -pointerInfo.event.deltaY*zoom_speed);
                camera2D.getViewMatrix().invertToRef(camera2D._cameraTransformMatrix);
                BABYLON.Vector3.TransformNormalToRef(camera2D._localDirection, camera2D._cameraTransformMatrix, camera2D._transformedDirection);
                camera2D.position.addInPlace(camera2D._transformedDirection);
                if(camera2D.position.z>camera_max_z)
                    camera2D.position.z=camera_max_z;
                else if(camera2D.position.z<camera_min_z)
                    camera2D.position.z=camera_min_z;
            break;
        }
        mapObserverLastPos = new BABYLON.Vector2(scene.pointerX,scene.pointerY)
    }

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

	// UI Base (all UI elements are children of this, except the ones tied to the map since those need to be attached to the mesh with the map texture)
	var advancedTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");

	// Checkbox to toggle performance mode
	performanceModeCheckbox = BABYLON.GUI.Checkbox.AddCheckBoxWithHeader("Performance mode", (value) => {
		performanceMode = value;
		// Clears all currently cached meshes
		for(let index = 0; index < meshes.length; ++index) {
			if(meshes[index] != null) {
				meshes[index].dispose();
				meshes[index] = null;
			}
		}
	});
	performanceModeCheckbox.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
	performanceModeCheckbox.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
	performanceModeCheckbox.left = "20px";
	performanceModeCheckbox.top = "20px";
	performanceModeCheckbox.children[0].isChecked = true; // Start enabled
	advancedTexture.addControl(performanceModeCheckbox);

	// UI Elements

	// Menu button configuration
	menuButton = BABYLON.GUI.Button.CreateSimpleButton("Menu Button", "Back to Menu");
	menuButton.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
	menuButton.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
	menuButton.left = "-20px";
	menuButton.top = "-20px";
	menuButton.width = "150px";
	menuButton.height = "50px";
	menuButton.background = "red";
	menuButton.color = "darkred";
	menuButton.cornerRadius = 3;
	menuButton.thickness = 3;

	// On Click behaviour for the menu button
	menuButton.onPointerUpObservable.add(() => {
		// Reenable the map
		mapGuiPlane.setEnabled(true);
		mapImagePlane.setEnabled(true);

		// Reenable performance mode checkbox
		performanceModeCheckbox.isVisible = true;

		// Go back to manual handling of mouse cursor for map view
		scene.doNotHandleCursors = true;
		canvas.style.cursor = "grab";

		// Reenable drag and drop
		mapDragging = false;
		mapPointerObserver = scene.onPointerObservable.add((e)=>onPointerMapDragDrop(e));

		// Hide 3D view UI and disable measurements
		menuButton.isVisible = false;
		MeasurementTool.hideButton();
		MeasurementTool.disable();

		// Disable current mesh (makes it invisible and improves performance)
		meshes[activeMeshIndex].setEnabled(false);

		// Reactivate 2D Camera
		camera3D.detachControl(canvas);
		camera2D.attachControl(canvas, true);
		camera2D.inputs.attached.mouse.detachControl();
		camera2D.inputs.attached.keyboard.detachControl();
		scene.activeCamera = camera2D;
	});

	// Add menu button to the UI and make it invisible
	advancedTexture.addControl(menuButton);
	menuButton.isVisible = false;

	////////////////////////////////////////////////////////////////////////////////////

	// Initializing measurement tool //
	await MeasurementTool.init(scene, advancedTexture);

	// Allows access to the debug mode of BabylonJS, including an inspector.
	// Convenient for debugging.
	// scene.debugLayer.show();
	
    return scene;
};

// Creation of the Babylon Engine
var engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
var scene;

// Create scene asynchronously, then when it's ready, define render loop to render the frames of the scene
createScene().then((loadedScene) => {
	scene = loadedScene;
	engine.runRenderLoop(function () {
		loadedScene.render(); // Render the frame in the scene
		divFps.innerHTML = engine.getFps().toFixed() + " FPS"; // Update the FPS counter
	});
});

// Resize when necessary
window.addEventListener("resize", function () {
	engine.resize();
});
