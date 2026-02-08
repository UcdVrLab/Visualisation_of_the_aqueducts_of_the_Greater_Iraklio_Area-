/*********************************************************************************************
 * Measurement Tool                                                                          *
 * Can be used to measure distances on a mesh                                                *
 * A reference line of known length must be drawn to convert from 3D units to real distances *
 *********************************************************************************************/

import ConversionHelper from "./conversions.js";

const MeasurementTool = (function () {
    var scene; // BabylonJS scene, required to process mouse inputs, for example
    var mtMeasurementLine, mtReferenceLine; // UI Lines
    var mtRefPoint1, mtRefPoint2; // Reference line vertices
    var mtMeasPoint1, mtMeasPoint2; // Measurement line vertices
    var mtObserver; // Pointer observer for the measurement tool
    var mtButton; // Button to activate measurement tool
    var mtRefInput, mtMeasText; // Input field and output text for the reference length and measurement length, respectively
    var mtPanel, mtCloseButton, mtRefLabel, mtRefHint, mtRefGroup; // HTML UI elements
    var sceneScale = null; // Scale factor for current mesh

    // Enables the measurement tool on the current mesh
    function enable() {
        // Hide the button
        hideButton();
        
        // Lazy octree creation - only when needed
        const activeMesh = scene.meshes.find(m => m.isEnabled() && m.name !== 'camera');
        if (activeMesh && !activeMesh._hasOctree) {
            console.log("Creating octree for picking...");
            if (activeMesh.getChildMeshes().length > 0) {
                activeMesh.getChildMeshes().forEach(child => {
                    child.subdivide(500); // Reduced from 1000
                    child.createOrUpdateSubmeshesOctree(64);
                });
            } else {
                activeMesh.subdivide(500);
                activeMesh.createOrUpdateSubmeshesOctree(64);
            }
            activeMesh._hasOctree = true;
        }

        // Show the measurement UI
        if (mtPanel) mtPanel.classList.add("mt-visible");

        // Tracks when and where the currently held click on the mesh has started
        var startingPoint = null;
        var startingTime = null;

        // If measurements are already enabled, do nothing
        if (mtObserver) return;

        // Pointer events to place the measurement points and calculate the length
        mtObserver = scene.onPointerObservable.add((pointerInfo) => {
            switch(pointerInfo.type) {
                // When click starts, record the time and position of the click
                case BABYLON.PointerEventTypes.POINTERDOWN:
                    startingPoint = {x: pointerInfo.event.x, y: pointerInfo.event.y};
                    startingTime = Date.now();
                    break;
                // When click stops, test if it's valid (short stationary click on a mesh), if so, move the relevant point to the clicked point on the mesh
                case BABYLON.PointerEventTypes.POINTERUP:
                    // Click is ignored if held for over 150ms
                    if(Date.now() - startingTime > 150) return;

                    // Click is ignored if the mouse moved during the hold
                    if(pointerInfo.event.x != startingPoint.x || pointerInfo.event.y != startingPoint.y) return;

                    // Click is ignored if not on a mesh
                    if(!pointerInfo.pickInfo.hit || !pointerInfo.pickInfo.pickedPoint) return;

                    // The point to move depends on the button that was clicked
                    switch(pointerInfo.event.button) {
                        case 0: // LEFT CLICK
                            // Ctrl+Click moves a reference point, otherwise it's a measurement point
                            if(pointerInfo.event.ctrlKey) {
                                // Show reference point, and the line if both points are active
                                mtRefPoint1.isVisible = true;
                                if(mtRefPoint2.isVisible) mtReferenceLine.isVisible = true;

                                // Move reference point to clicked spot on the mesh
                                mtRefPoint1.position.x = pointerInfo.pickInfo.pickedPoint.x;
                                mtRefPoint1.position.y = pointerInfo.pickInfo.pickedPoint.y;
                                mtRefPoint1.position.z = pointerInfo.pickInfo.pickedPoint.z; 
                            } else {
                                // Show measurement point, and the line if both points are active
                                mtMeasPoint1.isVisible = true;
                                if(mtMeasPoint2.isVisible) mtMeasurementLine.isVisible = true;

                                // Move measurement point to clicked spot on the mesh
                                mtMeasPoint1.position.x = pointerInfo.pickInfo.pickedPoint.x;
                                mtMeasPoint1.position.y = pointerInfo.pickInfo.pickedPoint.y;
                                mtMeasPoint1.position.z = pointerInfo.pickInfo.pickedPoint.z;
                            }
                            break;
                        case 2: // RIGHT CLICK
                            // Ctrl+Click moves a reference point, otherwise it's a measurement point
                            if(pointerInfo.event.ctrlKey) {
                                // Show reference point, and the line if both points are active
                                mtRefPoint2.isVisible = true;
                                if(mtRefPoint1.isVisible) mtReferenceLine.isVisible = true;

                                // Move reference point to clicked spot on the mesh
                                mtRefPoint2.position.y = pointerInfo.pickInfo.pickedPoint.y;
                                mtRefPoint2.position.z = pointerInfo.pickInfo.pickedPoint.z; 
                                mtRefPoint2.position.x = pointerInfo.pickInfo.pickedPoint.x;
                            } else {
                                // Show measurement point, and the line if both points are active
                                mtMeasPoint2.isVisible = true;
                                if(mtMeasPoint1.isVisible) mtMeasurementLine.isVisible = true;

                                // Move measurement point to clicked spot on the mesh
                                mtMeasPoint2.position.x = pointerInfo.pickInfo.pickedPoint.x;
                                mtMeasPoint2.position.y = pointerInfo.pickInfo.pickedPoint.y;
                                mtMeasPoint2.position.z = pointerInfo.pickInfo.pickedPoint.z;
                            }
                            break;
                    }

                    // Update display
                    updateDisplay();
                    break;
            }
        });
    }

    // Disables the measurement tool for the current mesh, if any
    function disable() {
        // If an observer has been defined, remove it
        if(mtObserver) {
            scene.onPointerObservable.remove(mtObserver);
            mtObserver = null;
        }
    
        // clear text field
        if (mtRefInput) mtRefInput.value = "";
    
        // hide measurement objects
        mtRefPoint1.isVisible = false;
        mtRefPoint2.isVisible = false;
        mtMeasPoint1.isVisible = false;
        mtMeasPoint2.isVisible = false;
        mtReferenceLine.isVisible = false;
        mtMeasurementLine.isVisible = false;
        if (mtPanel) mtPanel.classList.remove("mt-visible");
    }

    // LOCAL FUNCTION
    // Updates the text displaying the length of the measurement line
    function updateDisplay() {
        // If one of the measurement points is missing
        if(!mtMeasPoint1.isVisible || !mtMeasPoint2.isVisible) {
            mtMeasText.textContent = "Measurement line is not drawn";
            mtMeasText.dataset.state = "error";
            return;
        }

        // If scale is set, use it directly
        if (sceneScale !== null) {
            let measurementVector = mtMeasPoint2.position.subtract(mtMeasPoint1.position);
            let measurementMeterLength = measurementVector.length() * sceneScale;
            mtMeasText.textContent = ConversionHelper.metersToString(measurementMeterLength);
            mtMeasText.dataset.state = "ok";
            return;
        }

        // If one of the reference points is missing
        if(!mtRefPoint1.isVisible || !mtRefPoint2.isVisible) {
            mtMeasText.textContent = "Reference line is not drawn";
            mtMeasText.dataset.state = "error";
            return;
        }

        let measurementVector = mtMeasPoint2.position.subtract(mtMeasPoint1.position);
        let referenceVector = mtRefPoint2.position.subtract(mtRefPoint1.position);

        // If the reference line is of length 0
        if(referenceVector.length() === 0) {
            mtMeasText.textContent = "Reference line can't have a length of 0";
            mtMeasText.dataset.state = "error";
            return;
        }

        let referenceMeterLength = ConversionHelper.stringToMeters(mtRefInput ? mtRefInput.value : "");

        // If the conversion failed (= returned NaN)
        if(isNaN(referenceMeterLength)) {
            mtMeasText.textContent = "Reference line length is invalid";
            mtMeasText.dataset.state = "error";
            return;
        }

        let scaleValue = referenceMeterLength / referenceVector.length();
        let measurementMeterLength = measurementVector.length() * scaleValue;
        mtMeasText.textContent = ConversionHelper.metersToString(measurementMeterLength);
        mtMeasText.dataset.state = "ok";
        // Log scale value to console for developer use
        console.log(`Calculated scale: ${scaleValue.toPrecision(6)} (meters per mesh unit)`);
    }

    // Initializes all the necessary components for the measurement tool, in the given scene, attaching the UI to the given AdvancedTexture
    async function init(babylonScene, advancedTexture) {
        scene = babylonScene;

        // Non-UI objects and materials

        const sphereMat = new BABYLON.StandardMaterial("Sphere Material", scene);
        sphereMat.diffuseColor = BABYLON.Color3.Red();
    
        const refMat = new BABYLON.StandardMaterial("Reference Material", scene);
        refMat.diffuseColor = BABYLON.Color3.Purple();
    
        mtMeasPoint1 = BABYLON.MeshBuilder.CreateSphere("measPoint1", {diameter: 0.05}, scene);
        mtMeasPoint1.material = sphereMat;
        mtMeasPoint1.isPickable = false;
    
        mtMeasPoint2 = BABYLON.MeshBuilder.CreateSphere("measPoint2", {diameter: 0.05}, scene);
        mtMeasPoint2.material = sphereMat;
        mtMeasPoint2.isPickable = false;
    
        mtRefPoint1 = BABYLON.MeshBuilder.CreateSphere("refPoint1", {diameter: 0.05}, scene);
        mtRefPoint1.material = refMat;
        mtRefPoint1.isPickable = false;
    
        mtRefPoint2 = BABYLON.MeshBuilder.CreateSphere("refPoint2", {diameter: 0.05}, scene);
        mtRefPoint2.material = refMat;
        mtRefPoint2.isPickable = false;

        // UI Elements

        // Measurement line, its length (converted to real-world units) is shown
        mtMeasurementLine = new BABYLON.GUI.MultiLine("Measurement Line");
        mtMeasurementLine.add(mtMeasPoint1, mtMeasPoint2);
        mtMeasurementLine.color = "red";
        advancedTexture.addControl(mtMeasurementLine);

        // Reference line, basis for the conversion of mesh units into real-world units
        mtReferenceLine = new BABYLON.GUI.MultiLine("Reference Line");
        mtReferenceLine.add(mtRefPoint1, mtRefPoint2);
        mtReferenceLine.color = "purple";
        advancedTexture.addControl(mtReferenceLine);

        const guiContainer = document.getElementById("guiContainer");
        mtButton = document.getElementById("mtActivateButton");
        mtPanel = document.getElementById("mtPanel");
        mtCloseButton = document.getElementById("mtCloseButton");
        mtRefLabel = document.getElementById("mtRefLabel");
        mtRefHint = document.getElementById("mtRefHint");
        mtRefGroup = document.getElementById("mtRefGroup");
        mtMeasText = document.getElementById("mtResult");
        mtRefInput = document.getElementById("mt-ref-input");

        mtButton.addEventListener("click", () => {
            enable();
            updateDisplay();
        });

        mtCloseButton.addEventListener("click", () => {
            disable();
            showButton();
        });



        // Update the measurement when reference length input changes
        mtRefInput.addEventListener("input", () => {
            updateDisplay();
        });

        // Measurements are disabled by default since there's no mesh
        disable();
    }

    const showButton = () => {
        mtButton.classList.add("mt-visible");
    };
    const hideButton = () => {
        mtButton.classList.remove("mt-visible");
    };

    // Set scale for current mesh/scene
    function setScale(scale) {
        sceneScale = scale;
        // Optionally hide reference input UI if scale is set
        if (mtRefGroup) mtRefGroup.style.display = "none";
        if (mtRefHint) mtRefHint.style.display = "none";
        updateDisplay();
    }

    // Reset scale (e.g., when switching scenes)
    function resetScale() {
        sceneScale = null;
        if (mtRefGroup) mtRefGroup.style.display = "";
        if (mtRefHint) mtRefHint.style.display = "";
        updateDisplay();
    }

    return {
        showButton,
        hideButton,
        enable,
        disable,
        init,
        setScale,
        resetScale
    };
})();

export default MeasurementTool;