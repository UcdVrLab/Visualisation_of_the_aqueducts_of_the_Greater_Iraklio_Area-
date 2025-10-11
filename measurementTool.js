/*********************************************************************************************
 * Measurement Tool                                                                          *
 * Can be used to measure distances on a mesh                                                *
 * A reference line of known length must be drawn to convert from 3D units to real distances *
 *********************************************************************************************/

import ConversionHelper from "./conversions.js";

const MeasurementTool = (function () {
    var scene; // BabylonJS scene, required to process mouse inputs, for example
    var mtGUI; // Measurement Tool GUI
    var mtMeasurementLine, mtReferenceLine; // UI Lines
    var mtRefPoint1, mtRefPoint2; // Reference line vertices
    var mtMeasPoint1, mtMeasPoint2; // Measurement line vertices
    var mtObserver; // Pointer observer for the measurement tool
    var mtButton; // Button to activate measurement tool
    var mtRefInput, mtMeasText; // Input field and output text for the reference length and measurement length, respectively

    // Enables the measurement tool on the current mesh
    function enable() {
        // Hide the button
        hideButton();

        // Show the measurement UI
        mtGUI.isVisible = true;

        // Tracks when and where the currently held click on the mesh has started
        var startingPoint = null;
        var startingTime = null;

        // If measurements are already enabled, do nothing
        if(mtObserver) return;

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
        mtRefInput.text = "";
    
        // hide measurement objects
        mtRefPoint1.isVisible = false;
        mtRefPoint2.isVisible = false;
        mtMeasPoint1.isVisible = false;
        mtMeasPoint2.isVisible = false;
        mtReferenceLine.isVisible = false;
        mtMeasurementLine.isVisible = false;
        mtGUI.isVisible = false;
    }

    // LOCAL FUNCTION
    // Updates the text displaying the length of the measurement line
    function updateDisplay() {
        // If one of the measurement points is missing
        if(!mtMeasPoint1.isVisible || !mtMeasPoint2.isVisible) {
            mtMeasText.text = "Measurement line is not drawn";
            mtMeasText.color = "red";
            return;
        }
    
        // If one of the reference points is missing
        if(!mtRefPoint1.isVisible || !mtRefPoint2.isVisible) {
            mtMeasText.text = "Reference line is not drawn";
            mtMeasText.color = "red";
            return;
        }
    
        let measurementVector = mtMeasPoint2.position.subtract(mtMeasPoint1.position);
        let referenceVector = mtRefPoint2.position.subtract(mtRefPoint1.position);
    
        // If the reference line is of length 0
        if(referenceVector.length() === 0) {
            mtMeasText.text = "Reference line can't have a length of 0";
            mtMeasText.color = "red";
            return;
        }
    
        let referenceMeterLength = ConversionHelper.stringToMeters(mtRefInput.text);
    
        // If the conversion failed (= returned NaN)
        if(isNaN(referenceMeterLength)) {
            mtMeasText.text = "Reference line length is invalid";
            mtMeasText.color = "red";
            return;
        }
    
        let measurementMeterLength = measurementVector.length() * referenceMeterLength / referenceVector.length()
        mtMeasText.text = ConversionHelper.metersToString(measurementMeterLength);
        mtMeasText.color = "green";
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

        // Button with a measuring tape icon, to activate the measurement tool
        mtButton = new BABYLON.GUI.Button("mtButton");
        const mtButtonImage = new BABYLON.GUI.Image("mtButtonImage", "./gui/measure-tape-white.png");
        mtButton.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
        mtButton.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        mtButton.left = "10px";
        mtButton.top = "-10px";
        mtButton.width = "90px";
        mtButton.height = "90px";
        mtButton.cornerRadius = 10;
        mtButton.background = "#222222aa";
        mtButton.thickness = 2;
        mtButton.isVisible = false; // only visible when a mesh is loaded, not by default
        mtButton.addControl(mtButtonImage);
        advancedTexture.addControl(mtButton);

        // On click, activate tool
        mtButton.onPointerClickObservable.add(() => {
            enable();
            updateDisplay();
        });

        // Load GUI created with editor, get the measurement UI from it (by cloning and putting the clone in advancedTexture), then dispose of the loaded GUI
        let loadedGUI = await BABYLON.GUI.AdvancedDynamicTexture.ParseFromFileAsync("./gui/measurementToolGUI.json");
        mtGUI = loadedGUI.getControlByName("MeasurementUI").clone();
        advancedTexture.addControl(mtGUI);
        loadedGUI.dispose();

        // Get the close button and make it disable the tool
        let mtCloseButton = advancedTexture.getControlByName("MTCloseButton");
        mtCloseButton.onPointerUpObservable.add(() => {
            disable();
            showButton();
        });

        mtMeasText = advancedTexture.getControlByName("MTMeasText");
        mtRefInput = advancedTexture.getControlByName("MTRefInput");
        
        // Updates length text when the reference length has been changed
        mtRefInput.onTextChangedObservable.add((_eventData, _eventState) => {
            updateDisplay();
        });

        // Measurements are disabled by default since there's no mesh
        disable();
    }

    const showButton = () => {mtButton.isVisible = true};
    const hideButton = () => {mtButton.isVisible = false};

    return {
        showButton,
        hideButton,
        enable,
        disable,
        init
    };
})();

export default MeasurementTool;