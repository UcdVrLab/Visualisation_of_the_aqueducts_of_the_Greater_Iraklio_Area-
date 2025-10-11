/******************************************************************************************************
 * Conversion Helper                                                                                  *
 * Allows conversions from a string (e.g. "10.3 cm") to a meter length (i.e. 0.103) and vice-versa    *
 * Default export contains stringToMeters and metersToString functions                                *
 ******************************************************************************************************/

const ConversionHelper = (function () {
    // Units that can be interpreted by stringToMeters, associated with their power of 10
    const unitsIn = new Map();
    unitsIn.set("km", 1000);
    unitsIn.set("hm", 100);
    unitsIn.set("dam", 10);
    unitsIn.set("m", 1);
    unitsIn.set("dm", 0.1);
    unitsIn.set("cm", 0.01);
    unitsIn.set("mm", 0.001);
    unitsIn.set("µm", 1e-6);

    // Units that can be output by metersToString, associated with their power of 10
    // Must be sorted from smallest to largest for metersToString to work correctly
    const unitsOut = [["mm",1e-3],["cm",1e-2],["m",1],["km",1e3]];
    
    /* Converts a string containing a length and unit (e.g. "140.2 cm") to a number representing that length in meters (i.e. 1.402)
    / If string has no unit but it has a number, it's interpreted as meters
    / Invalid string yields a result of NaN */
    function stringToMeters(s) {
        // This Regex matches length units
        // Specifically, it checks for any amount of non-digit, non-whitespace characters followed by the letter m, and then a boundary (space, end of string)
        let unitIn = s.match(/[^\d\s]+m\b/g);

        var meterLength;
        if(unitIn && unitsIn.has(unitIn[0]))
            meterLength = parseFloat(s) * unitsIn.get(unitIn[0]);
        else
            meterLength = parseFloat(s); // interpret as meters if no unit

        return meterLength;
    }

    /* Converts a meter length into a string, converting into the largest unit for which the length is at least 1, if any (otherwise, the smallest unit is used)
    /  For example, a length of 0.8 is converted to the string "80 cm", because among the two units (cm, mm) for which the result is at least 1, cm is the biggest */
    function metersToString(meterLength, decimalCount = 3) {
        var result;
        // For each possible output unit
        unitsOut.forEach((it, index) => {
            let unit = it[0], power = it[1]; // get the unit and power of 10
            let convertedLength = meterLength / power; // convert meterLength to the unit
            if(convertedLength >= 1 || index == 0) {
                // if converted length is at least 1 (or we are on the smallest unit), write string to result
                result = convertedLength.toFixed(decimalCount) + " " + unit;
            }
        });
        // The resulting string is the one with the largest unit where the length is at least 1
        return result;
    }

    return {
        stringToMeters,
        metersToString
    };
})();

export default ConversionHelper;