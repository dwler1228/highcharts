/**
 * (c) 2010-2017 Torstein Honsi
 *
 * License: www.highcharts.com/license
 */
/* eslint max-len: 0 */
'use strict';
import H from '../parts/Globals.js';
import '../parts/Utilities.js';
import '../parts/Series.js';
var each = H.each,
	perspective = H.perspective,
	pick = H.pick,
	Series = H.Series,
	seriesTypes = H.seriesTypes,
	inArray = H.inArray,
	svg = H.svg,
	wrap = H.wrap;



/**
 * Depth of the columns in a 3D column chart. Requires `highcharts-3d.
 * js`.
 * 
 * @type {Number}
 * @default 25
 * @since 4.0
 * @product highcharts
 * @apioption plotOptions.column.depth
 */

/**
 * 3D columns only. The color of the edges. Similar to `borderColor`,
 *  except it defaults to the same color as the column.
 * 
 * @type {Color}
 * @product highcharts
 * @apioption plotOptions.column.edgeColor
 */

/**
 * 3D columns only. The width of the colored edges.
 * 
 * @type {Number}
 * @default 1
 * @product highcharts
 * @apioption plotOptions.column.edgeWidth
 */

/**
 * The spacing between columns on the Z Axis in a 3D chart. Requires
 * `highcharts-3d.js`.
 * 
 * @type {Number}
 * @default 1
 * @since 4.0
 * @product highcharts
 * @apioption plotOptions.column.groupZPadding
 */

wrap(seriesTypes.column.prototype, 'translate', function (proceed) {
	proceed.apply(this, [].slice.call(arguments, 1));

	// Do not do this if the chart is not 3D
	if (this.chart.is3d()) {
		this.translate3dShapes();
	}
});

seriesTypes.column.prototype.translate3dPoints = function () {};
seriesTypes.column.prototype.translate3dShapes = function () {

	var series = this,
		chart = series.chart,
		seriesOptions = series.options,
		depth = seriesOptions.depth || 25,
		stack = seriesOptions.stacking ?
			(seriesOptions.stack || 0) :
			series.index, // #4743
		z = stack * (depth + (seriesOptions.groupZPadding || 1)),
		borderCrisp = series.borderWidth % 2 ? 0.5 : 0;

	if (chart.inverted && !series.yAxis.reversed) {
		borderCrisp *= -1;
	}

	if (seriesOptions.grouping !== false) {
		z = 0;
	}

	z += (seriesOptions.groupZPadding || 1);
	each(series.data, function (point) {
		if (point.y !== null) {
			var shapeArgs = point.shapeArgs,
				tooltipPos = point.tooltipPos,
				// Array for final shapeArgs calculation.
				// We are checking two dimensions (x and y).
				dimensions = [['x', 'width'], ['y', 'height']],
				borderlessBase; // Crisped rects can have +/- 0.5 pixels offset.

			// #3131 We need to check if column is inside plotArea.
			each(dimensions, function (d) {
				borderlessBase = shapeArgs[d[0]] - borderCrisp;
				if (borderlessBase < 0) {
					// If borderLessBase is smaller than 0, it is needed to set
					// its value to 0 or 0.5 depending on borderWidth
					// borderWidth may be even or odd.
					shapeArgs[d[1]] += shapeArgs[d[0]] + borderCrisp;
					shapeArgs[d[0]] = -borderCrisp;
					borderlessBase = 0;
				}
				if (
						borderlessBase + shapeArgs[d[1]] > series[d[0] + 'Axis'].len &&
						shapeArgs[d[1]] !== 0 // Do not change height/width of column if 0.
						// #6708
					) {
					shapeArgs[d[1]] = series[d[0] + 'Axis'].len - shapeArgs[d[0]];
				}
				if (
						(shapeArgs[d[1]] !== 0) && // Do not remove columns with zero height/width.
						(
							shapeArgs[d[0]] >= series[d[0] + 'Axis'].len ||
							shapeArgs[d[0]] + shapeArgs[d[1]] <= borderCrisp
						)
					) {
					for (var key in shapeArgs) { // Set args to 0 if column is outside the chart.
						shapeArgs[key] = 0;
					}
				}
			});

			point.shapeType = 'cuboid';
			shapeArgs.z = z;
			shapeArgs.depth = depth;
			shapeArgs.insidePlotArea = true;

			// Translate the tooltip position in 3d space
			tooltipPos = perspective([{ x: tooltipPos[0], y: tooltipPos[1], z: z }], chart, true)[0];
			point.tooltipPos = [tooltipPos.x, tooltipPos.y];
		}
	});
	// store for later use #4067
	series.z = z;
};

wrap(seriesTypes.column.prototype, 'animate', function (proceed) {
	if (!this.chart.is3d()) {
		proceed.apply(this, [].slice.call(arguments, 1));
	} else {
		var args = arguments,
			init = args[1],
			yAxis = this.yAxis,
			series = this,
			reversed = this.yAxis.reversed;

		if (svg) { // VML is too slow anyway
			if (init) {
				each(series.data, function (point) {
					if (point.y !== null) {
						point.height = point.shapeArgs.height;
						point.shapey = point.shapeArgs.y;	// #2968
						point.shapeArgs.height = 1;
						if (!reversed) {
							if (point.stackY) {
								point.shapeArgs.y = point.plotY + yAxis.translate(point.stackY);
							} else {
								point.shapeArgs.y = point.plotY + (point.negative ? -point.height : point.height);
							}
						}
					}
				});

			} else { // run the animation				
				each(series.data, function (point) {					
					if (point.y !== null) {
						point.shapeArgs.height = point.height;
						point.shapeArgs.y = point.shapey;	// #2968
						// null value do not have a graphic
						if (point.graphic) {
							point.graphic.animate(point.shapeArgs, series.options.animation);
						}
					}
				});

				// redraw datalabels to the correct position
				this.drawDataLabels();

				// delete this function to allow it only once
				series.animate = null;
			}
		}
	}
});

/*
 * In case of 3d columns there is no sense to add this columns
 * to a specific series group - if series is added to a group
 * all columns will have the same zIndex in comparison with different series
 */

wrap(seriesTypes.column.prototype, 'plotGroup', function (proceed, prop, name, visibility, zIndex, parent) {
	if (this.chart.is3d() && parent && !this[prop]) {
		if (!this.chart.columnGroup) {
			this.chart.columnGroup = this.chart.renderer.g('columnGroup').add(parent);
		}
		this[prop] = this.chart.columnGroup;
		this.chart.columnGroup.attr(this.getPlotBox());
		this[prop].survive = true;
	}
	return proceed.apply(this, Array.prototype.slice.call(arguments, 1));
});

/*
 * When series is not added to group it is needed to change 
 * setVisible method to allow correct Legend funcionality
 * This wrap is basing on pie chart series
 */
wrap(seriesTypes.column.prototype, 'setVisible', function (proceed, vis) {
	var series = this,
		pointVis;
	if (series.chart.is3d()) {
		each(series.data, function (point) {
			point.visible = point.options.visible = vis = vis === undefined ? !point.visible : vis;
			pointVis = vis ? 'visible' : 'hidden';
			series.options.data[inArray(point, series.data)] = point.options;
			if (point.graphic) {
				point.graphic.attr({
					visibility: pointVis
				});
			}
		});
	}
	proceed.apply(this, Array.prototype.slice.call(arguments, 1));
});

wrap(seriesTypes.column.prototype, 'init', function (proceed) {
	proceed.apply(this, [].slice.call(arguments, 1));

	if (this.chart.is3d()) {
		var seriesOptions = this.options,
			grouping = seriesOptions.grouping,
			stacking = seriesOptions.stacking,
			reversedStacks = pick(this.yAxis.options.reversedStacks, true),
			z = 0;

		if (!(grouping !== undefined && !grouping)) {
			var stacks = this.chart.retrieveStacks(stacking),
				stack = seriesOptions.stack || 0,
				i; // position within the stack
			for (i = 0; i < stacks[stack].series.length; i++) {
				if (stacks[stack].series[i] === this) {
					break;
				}
			}
			z = (10 * (stacks.totalStacks - stacks[stack].position)) + (reversedStacks ? i : -i); // #4369

			// In case when axis is reversed, columns are also reversed inside the group (#3737)
			if (!this.xAxis.reversed) {
				z = (stacks.totalStacks * 10) - z;
			}
		}

		seriesOptions.zIndex = z;
	}
});

/*= if (build.classic) { =*/
function pointAttribs(proceed) {
	var attr = proceed.apply(this, [].slice.call(arguments, 1));

	if (this.chart.is3d && this.chart.is3d()) {
		// Set the fill color to the fill color to provide a smooth edge
		attr.stroke = this.options.edgeColor || attr.fill;
		attr['stroke-width'] = pick(this.options.edgeWidth, 1); // #4055
	}

	return attr;
}

wrap(seriesTypes.column.prototype, 'pointAttribs', pointAttribs);
if (seriesTypes.columnrange) {
	wrap(seriesTypes.columnrange.prototype, 'pointAttribs', pointAttribs);
	seriesTypes.columnrange.prototype.plotGroup = seriesTypes.column.prototype.plotGroup;
	seriesTypes.columnrange.prototype.setVisible = seriesTypes.column.prototype.setVisible;
}
/*= } =*/

wrap(Series.prototype, 'alignDataLabel', function (proceed) {
	
	// Only do this for 3D columns and columnranges
	if (this.chart.is3d() && (this.type === 'column' || this.type === 'columnrange')) {
		var series = this,
			chart = series.chart;

		var args = arguments,
			alignTo = args[4];

		var pos = ({ x: alignTo.x, y: alignTo.y, z: series.z });
		pos = perspective([pos], chart, true)[0];
		alignTo.x = pos.x;
		alignTo.y = pos.y;
	}

	proceed.apply(this, [].slice.call(arguments, 1));
});

// Added stackLabels position calculation for 3D charts.
wrap(H.StackItem.prototype, 'getStackBox', function (proceed, chart) { // #3946
	var stackBox = proceed.apply(this, [].slice.call(arguments, 1));

	// Only do this for 3D chart.
	if (chart.is3d()) {
		var pos = ({
			x: stackBox.x,
			y: stackBox.y,
			z: 0
		});
		pos = H.perspective([pos], chart, true)[0];
		stackBox.x = pos.x;
		stackBox.y = pos.y;
	}

	return stackBox;
});

/*
	EXTENSION FOR 3D CYLINDRICAL COLUMNS
	Not supported
*/
/*
var defaultOptions = H.getOptions();
defaultOptions.plotOptions.cylinder = H.merge(defaultOptions.plotOptions.column);
var CylinderSeries = H.extendClass(seriesTypes.column, {
	type: 'cylinder'
});
seriesTypes.cylinder = CylinderSeries;

wrap(seriesTypes.cylinder.prototype, 'translate', function (proceed) {
	proceed.apply(this, [].slice.call(arguments, 1));

	// Do not do this if the chart is not 3D
	if (!this.chart.is3d()) {
		return;
	}

	var series = this,
		chart = series.chart,
		options = chart.options,
		cylOptions = options.plotOptions.cylinder,
		options3d = options.chart.options3d,
		depth = cylOptions.depth || 0,
		alpha = chart.alpha3d;

	var z = cylOptions.stacking ? (this.options.stack || 0) * depth : series._i * depth;
	z += depth / 2;

	if (cylOptions.grouping !== false) { z = 0; }

	each(series.data, function (point) {
		var shapeArgs = point.shapeArgs,
			deg2rad = H.deg2rad;
		point.shapeType = 'arc3d';
		shapeArgs.x += depth / 2;
		shapeArgs.z = z;
		shapeArgs.start = 0;
		shapeArgs.end = 2 * PI;
		shapeArgs.r = depth * 0.95;
		shapeArgs.innerR = 0;
		shapeArgs.depth = shapeArgs.height * (1 / sin((90 - alpha) * deg2rad)) - z;
		shapeArgs.alpha = 90 - alpha;
		shapeArgs.beta = 0;
	});
});
*/
