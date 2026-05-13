/**
 * Pro 测算器核心：2026-01-15 后美国 FBA 配送费（标价三价带 &lt;$10 / $10–$50 / &gt;$50）+ 危险品 + 服饰/一般分流；默认含 3.5% 燃油附加。
 * 旺季仓储：按分档（标准件 vs 大件/超大件）用 2026 仓储淡旺单价比，并结合 2025 配送淡旺倍率在同类内微调。
 * ES5 语法，供 docs/index.html 引用。
 */
(function (global) {
  var AMAZON_FBA_FEE_HELP =
    "https://sellercentral.amazon.com/help/hub/reference/external/GABBX6GZPA8MSZGW";
  var US_FBA_DIMENSIONAL_WEIGHT_DIVISOR = 139;
  var CM_PER_IN = 2.54;
  var KG_PER_LB = 0.45359237;
  var OZ_PER_LB = 16;

  var RESOLVED_TIER_LABEL = {
    small_standard: "小号标准件",
    large_standard: "大号标准件",
    small_bulky: "小号大件",
    large_bulky: "大号大件",
    extra_large_0_to_50: "超大件 0–50 lb",
    extra_large_50_to_70: "超大件 50–70 lb",
    extra_large_70_to_150: "超大件 70–150 lb",
    extra_large_over_150: "超大件 >150 lb",
  };

  /**
   * 标价价带（2026-01-15 后三档）：与 Seller Central 价带一致
   * 0: <$10  1: $10–$50  2: >$50
   */
  function listPriceBand(listPriceUsd) {
    var p = Math.max(0, listPriceUsd);
    if (p < 10) return 0;
    if (p <= 50) return 1;
    return 2;
  }

  function listPriceBandLabel(band) {
    if (band === 0) return "标价<$10";
    if (band === 1) return "$10–$50";
    return ">$50";
  }

  /** 非危险品·一般·小号标准（2026 非旺季，不含燃油附加） */
  var GENERAL_SMALL_TRIPLE = [
    { maxOz: 2, b0: 2.43, b1: 3.32, b2: 3.58 },
    { maxOz: 4, b0: 2.49, b1: 3.42, b2: 3.68 },
    { maxOz: 6, b0: 2.56, b1: 3.45, b2: 3.71 },
    { maxOz: 8, b0: 2.66, b1: 3.54, b2: 3.8 },
    { maxOz: 10, b0: 2.77, b1: 3.68, b2: 3.94 },
    { maxOz: 12, b0: 2.82, b1: 3.78, b2: 4.04 },
    { maxOz: 14, b0: 2.92, b1: 3.91, b2: 4.17 },
    { maxOz: 16, b0: 2.95, b1: 3.96, b2: 4.22 },
  ];

  /** 非危险品·一般·大号标准 */
  var GENERAL_LARGE_TRIPLE = [
    { maxOz: 4, b0: 2.91, b1: 3.73, b2: 3.99 },
    { maxOz: 8, b0: 3.13, b1: 3.95, b2: 4.21 },
    { maxOz: 12, b0: 3.38, b1: 4.2, b2: 4.46 },
    { maxOz: 16, b0: 3.78, b1: 4.6, b2: 4.86 },
    { maxOz: 20, b0: 4.22, b1: 5.04, b2: 5.3 },
    { maxOz: 24, b0: 4.6, b1: 5.42, b2: 5.68 },
    { maxOz: 28, b0: 4.75, b1: 5.57, b2: 5.83 },
    { maxOz: 32, b0: 5.0, b1: 5.82, b2: 6.08 },
    { maxOz: 36, b0: 5.1, b1: 5.92, b2: 6.18 },
    { maxOz: 40, b0: 5.28, b1: 6.1, b2: 6.36 },
    { maxOz: 44, b0: 5.44, b1: 6.26, b2: 6.52 },
    { maxOz: 48, b0: 5.85, b1: 6.67, b2: 6.93 },
  ];

  /** 服饰·小号标准 */
  var APPAREL_SMALL_TRIPLE = [
    { maxOz: 2, b0: 2.62, b1: 3.51, b2: 3.77 },
    { maxOz: 4, b0: 2.64, b1: 3.54, b2: 3.8 },
    { maxOz: 6, b0: 2.68, b1: 3.59, b2: 3.85 },
    { maxOz: 8, b0: 2.81, b1: 3.69, b2: 3.95 },
    { maxOz: 10, b0: 3.0, b1: 3.91, b2: 4.17 },
    { maxOz: 12, b0: 3.1, b1: 4.09, b2: 4.35 },
    { maxOz: 14, b0: 3.2, b1: 4.2, b2: 4.46 },
    { maxOz: 16, b0: 3.3, b1: 4.25, b2: 4.51 },
  ];

  /** 服饰·大号标准 */
  var APPAREL_LARGE_TRIPLE = [
    { maxOz: 4, b0: 3.48, b1: 4.3, b2: 4.56 },
    { maxOz: 8, b0: 3.68, b1: 4.5, b2: 4.76 },
    { maxOz: 12, b0: 3.9, b1: 4.72, b2: 4.98 },
    { maxOz: 16, b0: 4.35, b1: 5.17, b2: 5.43 },
    { maxOz: 20, b0: 5.05, b1: 5.87, b2: 6.13 },
    { maxOz: 24, b0: 5.22, b1: 6.04, b2: 6.3 },
    { maxOz: 28, b0: 5.32, b1: 6.14, b2: 6.4 },
    { maxOz: 32, b0: 5.43, b1: 6.25, b2: 6.51 },
    { maxOz: 36, b0: 5.78, b1: 6.6, b2: 6.86 },
    { maxOz: 40, b0: 5.9, b1: 6.72, b2: 6.98 },
    { maxOz: 44, b0: 5.95, b1: 6.77, b2: 7.03 },
    { maxOz: 48, b0: 6.08, b1: 6.9, b2: 7.16 },
  ];

  /** 危险品·小号标准 */
  var DG_SMALL_TRIPLE = [
    { maxOz: 2, b0: 3.4, b1: 4.29, b2: 4.55 },
    { maxOz: 4, b0: 3.43, b1: 4.36, b2: 4.62 },
    { maxOz: 6, b0: 3.48, b1: 4.37, b2: 4.63 },
    { maxOz: 8, b0: 3.55, b1: 4.43, b2: 4.69 },
    { maxOz: 10, b0: 3.64, b1: 4.55, b2: 4.81 },
    { maxOz: 12, b0: 3.65, b1: 4.61, b2: 4.87 },
    { maxOz: 14, b0: 3.73, b1: 4.72, b2: 4.98 },
    { maxOz: 16, b0: 3.77, b1: 4.78, b2: 5.04 },
  ];

  /** 危险品·大号标准 */
  var DG_LARGE_TRIPLE = [
    { maxOz: 4, b0: 3.73, b1: 4.55, b2: 4.81 },
    { maxOz: 8, b0: 3.94, b1: 4.76, b2: 5.02 },
    { maxOz: 12, b0: 4.17, b1: 4.99, b2: 5.25 },
    { maxOz: 16, b0: 4.37, b1: 5.19, b2: 5.45 },
    { maxOz: 20, b0: 4.82, b1: 5.64, b2: 5.9 },
    { maxOz: 24, b0: 5.2, b1: 6.02, b2: 6.28 },
    { maxOz: 28, b0: 5.35, b1: 6.17, b2: 6.43 },
    { maxOz: 32, b0: 5.49, b1: 6.31, b2: 6.57 },
    { maxOz: 36, b0: 5.56, b1: 6.38, b2: 6.64 },
    { maxOz: 40, b0: 5.74, b1: 6.56, b2: 6.82 },
    { maxOz: 44, b0: 5.9, b1: 6.72, b2: 6.98 },
    { maxOz: 48, b0: 6.31, b1: 7.13, b2: 7.39 },
  ];

  /** 大号标准 >48oz：首 3 lb 基础费 + 每 4 oz */
  var LARGE_GENERAL_OVER3LB_BASE = [6.15, 6.97, 7.23];
  var LARGE_DG_OVER3LB_BASE = [6.61, 7.43, 7.69];
  /** 服饰大号 >48oz：首 3 lb + 每 0.5 lb */
  var LARGE_APPAREL_OVER3LB_BASE = [6.15, 6.97, 7.23];

  function sortedDims(lengthIn, widthIn, heightIn) {
    var d = [lengthIn, widthIn, heightIn].sort(function (a, b) {
      return b - a;
    });
    return [d[0], d[1], d[2]];
  }

  function lengthPlusGirth(longest, median, shortest) {
    return longest + 2 * (median + shortest);
  }

  function volumeCuInches(lengthIn, widthIn, heightIn) {
    return Math.max(0, lengthIn) * Math.max(0, widthIn) * Math.max(0, heightIn);
  }

  function dimensionalWeightLb(cuIn) {
    if (cuIn <= 0) return 0;
    return cuIn / US_FBA_DIMENSIONAL_WEIGHT_DIVISOR;
  }

  function lengthToInches(value, unit) {
    var v = Math.max(0, Number(value) || 0);
    return unit === "cm" ? v / CM_PER_IN : v;
  }

  function weightToLb(value, unit) {
    var v = Math.max(0, Number(value) || 0);
    if (unit === "kg") return v / KG_PER_LB;
    if (unit === "oz") return v / OZ_PER_LB;
    return v;
  }

  function volumeCuFtFromInches(lengthIn, widthIn, heightIn) {
    return volumeCuInches(lengthIn, widthIn, heightIn) / 1728;
  }

  function classifyTierAuto(lengthIn, widthIn, heightIn, billableShippingLb) {
    var sd = sortedDims(lengthIn, widthIn, heightIn);
    var longest = sd[0];
    var median = sd[1];
    var shortest = sd[2];
    var shipOz = Math.ceil(billableShippingLb * 16 - 1e-9);

    var fitsSmallEnvelope =
      longest <= 15 &&
      median <= 12 &&
      shortest <= 0.75 &&
      shipOz <= 16 &&
      billableShippingLb <= 1;

    var fitsLargeStandardDims = longest <= 18 && median <= 14 && shortest <= 8;

    var fitsSmallBulkyDims =
      longest <= 37 &&
      median <= 28 &&
      shortest <= 20 &&
      lengthPlusGirth(longest, median, shortest) <= 130;

    var fitsLargeBulkyDims =
      longest <= 59 &&
      median <= 33 &&
      shortest <= 33 &&
      lengthPlusGirth(longest, median, shortest) <= 130;

    if (fitsSmallEnvelope) return "small_standard";
    if (fitsLargeStandardDims && billableShippingLb <= 20) return "large_standard";
    if (fitsSmallBulkyDims && billableShippingLb <= 50) return "small_bulky";
    if (fitsLargeBulkyDims && billableShippingLb <= 50) return "large_bulky";
    if (billableShippingLb <= 50) return "extra_large_0_to_50";
    if (billableShippingLb <= 70) return "extra_large_50_to_70";
    if (billableShippingLb <= 150) return "extra_large_70_to_150";
    return "extra_large_over_150";
  }

  function lookupTriple(brackets, shipOz, band) {
    var i;
    var row;
    for (i = 0; i < brackets.length; i++) {
      row = brackets[i];
      if (shipOz <= row.maxOz) {
        return band === 0 ? row.b0 : band === 1 ? row.b1 : row.b2;
      }
    }
    row = brackets[brackets.length - 1];
    return band === 0 ? row.b0 : band === 1 ? row.b1 : row.b2;
  }

  function feeGeneralLargeOver48Oz(shipOz, band, bases) {
    var maxLargeOz = 20 * 16;
    var cappedOz = Math.min(shipOz, maxLargeOz);
    var baseOz = 48;
    var baseFee = bases[band];
    var extraOz = Math.max(0, cappedOz - baseOz);
    var steps = Math.ceil(extraOz / 4);
    return baseFee + steps * 0.08;
  }

  function feeApparelLargeOver48Oz(shipOz, band) {
    var maxLargeOz = 20 * 16;
    var cappedOz = Math.min(shipOz, maxLargeOz);
    var billLb = cappedOz / 16;
    var baseFee = LARGE_APPAREL_OVER3LB_BASE[band];
    var baseLb = 3;
    var extraLb = Math.max(0, billLb - baseLb);
    var steps = Math.ceil(extraLb / 0.5 - 1e-9);
    return baseFee + steps * 0.16;
  }

  function feeGeneralSmallStandard(shipOz, band) {
    return lookupTriple(GENERAL_SMALL_TRIPLE, shipOz, band);
  }

  function feeGeneralLargeStandard(shipOz, band) {
    var cappedOz = Math.min(shipOz, 20 * 16);
    if (cappedOz <= 48) return lookupTriple(GENERAL_LARGE_TRIPLE, cappedOz, band);
    return feeGeneralLargeOver48Oz(shipOz, band, LARGE_GENERAL_OVER3LB_BASE);
  }

  function feeApparelSmallStandard(shipOz, band) {
    return lookupTriple(APPAREL_SMALL_TRIPLE, shipOz, band);
  }

  function feeApparelLargeStandard(shipOz, band) {
    var cappedOz = Math.min(shipOz, 20 * 16);
    if (cappedOz <= 48) return lookupTriple(APPAREL_LARGE_TRIPLE, cappedOz, band);
    return feeApparelLargeOver48Oz(shipOz, band);
  }

  function feeDgSmallStandard(shipOz, band) {
    return lookupTriple(DG_SMALL_TRIPLE, shipOz, band);
  }

  function feeDgLargeStandard(shipOz, band) {
    var cappedOz = Math.min(shipOz, 20 * 16);
    if (cappedOz <= 48) return lookupTriple(DG_LARGE_TRIPLE, cappedOz, band);
    return feeGeneralLargeOver48Oz(shipOz, band, LARGE_DG_OVER3LB_BASE);
  }

  function fulfillmentFeeForTier(
    tier,
    billableShippingLb,
    billableShippingOz,
    category,
    band,
    isDg
  ) {
    if (isDg && (tier === "small_standard" || tier === "large_standard")) {
      return tier === "small_standard"
        ? feeDgSmallStandard(billableShippingOz, band)
        : feeDgLargeStandard(billableShippingOz, band);
    }

    switch (tier) {
      case "small_standard":
        return (category === "apparel" ? feeApparelSmallStandard : feeGeneralSmallStandard)(
          billableShippingOz,
          band
        );
      case "large_standard":
        return (category === "apparel" ? feeApparelLargeStandard : feeGeneralLargeStandard)(
          billableShippingOz,
          band
        );
      case "small_bulky": {
        var lb0 = billableShippingLb;
        if (isDg) {
          var sbdg = [7.5, 8.27, 8.27][band];
          return sbdg + Math.max(0, lb0 - 1) * 0.38;
        }
        var sb = [6.78, 7.55, 7.55][band];
        return sb + Math.max(0, lb0 - 1) * 0.38;
      }
      case "large_bulky": {
        var lb = billableShippingLb;
        if (isDg) {
          var bdg = [9.3, 10.07, 10.07][band];
          return bdg + Math.max(0, lb - 1) * 0.38;
        }
        var b = [8.58, 9.35, 9.35][band];
        return b + Math.max(0, lb - 1) * 0.38;
      }
      case "extra_large_0_to_50": {
        var lbx = billableShippingLb;
        if (isDg) {
          var ex0dg = [27.67, 28.44, 28.44][band];
          return ex0dg + Math.max(0, lbx - 1) * 0.38;
        }
        var ex0 = [25.56, 26.33, 26.33][band];
        return ex0 + Math.max(0, lbx - 1) * 0.38;
      }
      case "extra_large_50_to_70": {
        var lb2 = billableShippingLb;
        if (isDg) {
          var xdg = [39.76, 40.53, 40.53][band];
          return xdg + Math.max(0, lb2 - 51) * 0.75;
        }
        var x = [36.55, 37.32, 37.32][band];
        return x + Math.max(0, lb2 - 51) * 0.75;
      }
      case "extra_large_70_to_150": {
        var lb3 = billableShippingLb;
        if (isDg) {
          var ydg = [57.68, 58.45, 58.45][band];
          return ydg + Math.max(0, lb3 - 71) * 0.75;
        }
        var y = [50.55, 51.32, 51.32][band];
        return y + Math.max(0, lb3 - 71) * 0.75;
      }
      case "extra_large_over_150": {
        var lb4 = billableShippingLb;
        if (isDg) {
          var zdg = [218.76, 219.53, 219.53][band];
          return zdg + Math.max(0, lb4 - 151) * 0.19;
        }
        var z = [194.18, 194.95, 194.95][band];
        return z + Math.max(0, lb4 - 151) * 0.19;
      }
      default:
        return feeGeneralLargeStandard(billableShippingOz, band);
    }
  }

  function estimateUsFbaFulfillment(input) {
    var notes = [];
    var dimUnit = input.dimUnit === "cm" ? "cm" : "in";
    var weightUnit =
      input.weightUnit === "kg" || input.weightUnit === "oz" ? input.weightUnit : "lb";
    var lengthIn = lengthToInches(input.lengthIn, dimUnit);
    var widthIn = lengthToInches(input.widthIn, dimUnit);
    var heightIn = lengthToInches(input.heightIn, dimUnit);
    var sd = sortedDims(lengthIn, widthIn, heightIn);
    var longest = sd[0];
    var median = sd[1];
    var shortest = sd[2];
    var lpg = lengthPlusGirth(longest, median, shortest);
    var volumeCuIn = volumeCuInches(lengthIn, widthIn, heightIn);
    var volumeCuFt = volumeCuIn / 1728;
    var dimLb = dimensionalWeightLb(volumeCuIn);
    var itemLb = weightToLb(input.itemWeightLb, weightUnit);
    var billableShippingLb = Math.max(itemLb, dimLb);
    var billableShippingOz = Math.ceil(billableShippingLb * 16 - 1e-9);
    var listPriceUsd = Math.max(0, input.listPriceUsd != null ? input.listPriceUsd : 0);
    var band = listPriceBand(listPriceUsd);
    var isDg = !!input.dangerousGoods;

    var resolvedTier;
    var tierSource;
    if (input.tierOverride !== "auto") {
      resolvedTier = input.tierOverride;
      tierSource = "override";
      notes.push("档位为手动指定。");
    } else {
      resolvedTier = classifyTierAuto(
        lengthIn,
        widthIn,
        heightIn,
        billableShippingLb
      );
      tierSource = "auto";
    }

    if (dimUnit !== "in" || weightUnit !== "lb") {
      notes.push("输入单位已换算为英寸/磅参与体积重与分档计算。");
    }
    if (input.category === "apparel") {
      notes.push("品类为服饰，使用服饰配送费阶梯。");
    }
    if (isDg) {
      notes.push("危险品：小号/大号标准走危险品阶梯，大件/超大走危险品大件表。");
    }
    if (billableShippingLb <= 150 && (longest > 96 || lpg > 130)) {
      notes.push("命中特大号/Overmax 条件（最长边>96 或 长度加围长>130）。");
    }
    notes.push("价带 " + listPriceBandLabel(band) + "（标价 $" + listPriceUsd.toFixed(2) + "）。");

    notes.push(
      "体积重 " +
        dimLb.toFixed(3) +
        " lb；计费 " +
        billableShippingLb.toFixed(3) +
        " lb（" +
        billableShippingOz +
        " oz）。"
    );

    var fulfillmentFeeUsd = fulfillmentFeeForTier(
      resolvedTier,
      billableShippingLb,
      billableShippingOz,
      input.category,
      band,
      isDg
    );

    return {
      volumeCuIn: volumeCuIn,
      volumeCuFt: volumeCuFt,
      dimensionalWeightLb: dimLb,
      itemWeightLb: itemLb,
      billableShippingLb: billableShippingLb,
      billableShippingOz: billableShippingOz,
      resolvedTier: resolvedTier,
      tierSource: tierSource,
      fulfillmentFeeUsd: fulfillmentFeeUsd,
      listPriceBand: band,
      notes: notes,
    };
  }

  /** 2026-04-17 起燃油与物流附加费（叠加在履约配送费上） */
  var FBA_FUEL_SURCHARGE_RATE = 0.035;

  /**
   * 2026 美国站月度仓储参考单价 $/ft³（淡季 Jan–Sep vs 旺季 Oct–Dec），按 Amazon 标准件 / 大件（含超大）两档。
   * 数值请与 Seller Central 当年费率核对后更新。
   */
  var STORAGE_OFF_USD_PER_CUFT_STANDARD_2026 = 0.78;
  var STORAGE_PEAK_USD_PER_CUFT_STANDARD_2026 = 2.4;
  var STORAGE_OFF_USD_PER_CUFT_OVERSIZE_2026 = 0.56;
  var STORAGE_PEAK_USD_PER_CUFT_OVERSIZE_2026 = 1.4;

  /**
   * 2025 旺季 vs 非旺季「配送费」倍率（同一尺寸段代表性 SKU），用于在同类仓储内微调各分档的旺季仓储倍率。
   * 来源：2025 holiday peak fulfillment 公告/对照表（小号标准 2oz、大号标准约 2lb、大件 0–50lb 首重等）。
   */
  var FULFILLMENT_PEAK_NON_RATIO_2025 = {
    small_standard: 3.25 / 3.06,
    large_standard: 6.1 / 5.77,
    small_bulky: 10.65 / 9.61,
    large_bulky: 10.65 / 9.61,
    extra_large_0_to_50: 10.65 / 9.61,
    extra_large_50_to_70: 10.65 / 9.61,
    extra_large_70_to_150: 203.46 / 194.96,
    extra_large_over_150: 203.46 / 194.96,
  };

  var OVERSIZE_STORAGE_TIERS = [
    "small_bulky",
    "large_bulky",
    "extra_large_0_to_50",
    "extra_large_50_to_70",
    "extra_large_70_to_150",
    "extra_large_over_150",
  ];

  function storageClassFromResolvedTier(resolvedTier) {
    if (resolvedTier === "small_standard" || resolvedTier === "large_standard") return "standard";
    return "oversize";
  }

  function storageOffPeakRefUsdPerCuFt(resolvedTier) {
    return storageClassFromResolvedTier(resolvedTier) === "standard"
      ? STORAGE_OFF_USD_PER_CUFT_STANDARD_2026
      : STORAGE_OFF_USD_PER_CUFT_OVERSIZE_2026;
  }

  function storagePeakRefUsdPerCuFt(resolvedTier) {
    return storageClassFromResolvedTier(resolvedTier) === "standard"
      ? STORAGE_PEAK_USD_PER_CUFT_STANDARD_2026
      : STORAGE_PEAK_USD_PER_CUFT_OVERSIZE_2026;
  }

  function fulfillmentPeakNonRatio2025(resolvedTier) {
    var r = FULFILLMENT_PEAK_NON_RATIO_2025[resolvedTier];
    if (r && isFinite(r) && r > 0) return r;
    return 1.06;
  }

  function meanFulfillmentPeakNonRatio2025ForClass(storageClass) {
    var tiers =
      storageClass === "standard" ? ["small_standard", "large_standard"] : OVERSIZE_STORAGE_TIERS.slice();
    var sum = 0;
    var n = 0;
    var i;
    for (i = 0; i < tiers.length; i++) {
      var v = FULFILLMENT_PEAK_NON_RATIO_2025[tiers[i]];
      if (v && isFinite(v) && v > 0) {
        sum += v;
        n++;
      }
    }
    return n ? sum / n : 1.06;
  }

  /**
   * 旺季仓储：在你填的 $/ft³/月（视为淡季口径）上，按「分档结果」对应的标准件/大件仓储价带，
   * 用 2026 官方淡旺季单价比 + 2025 配送淡旺季倍率在同类内的相对差异做估算。
   */
  function peakStorageRateMultiplier(resolvedTier) {
    var cls = storageClassFromResolvedTier(resolvedTier);
    var baseRatio = storagePeakRefUsdPerCuFt(resolvedTier) / storageOffPeakRefUsdPerCuFt(resolvedTier);
    var fTier = fulfillmentPeakNonRatio2025(resolvedTier);
    var fMean = meanFulfillmentPeakNonRatio2025ForClass(cls);
    var mult = baseRatio * (fTier / fMean);
    if (!isFinite(mult) || mult < 1) mult = 1;
    if (mult > 5) mult = 5;
    return mult;
  }

  /**
   * 勾选「旺季配送」时：在表内算出的配送费（已含燃油附加）上再乘以此系数，近似旺季履约加价。
   * 官方按尺寸档/月份单独表，此处为可调简化倍率。
   */
  var FULFILLMENT_PEAK_SEASON_MULTIPLIER = 1.2;

  function toRatio(value) {
    if (!isFinite(value)) return 0;
    var v = Math.abs(value);
    if (v > 1.000001) return Math.min(v / 100, 1);
    return Math.min(v, 1);
  }

  function computeRow(row) {
    var promo = toRatio(row.promoPct);
    var refund = toRatio(row.refundPct);
    var referral = toRatio(row.referralPct);
    var adRate = toRatio(row.adPctOfEffectivePrice);
    var listPrice = Math.max(0, row.listPriceUsd);
    var band = listPriceBand(listPrice);

    var fe = estimateUsFbaFulfillment({
      lengthIn: row.lengthIn,
      widthIn: row.widthIn,
      heightIn: row.heightIn,
      dimUnit: row.dimUnit,
      itemWeightLb: row.itemWeightLb,
      weightUnit: row.weightUnit,
      category: row.productFeeCategory,
      tierOverride: row.sizeTierMode,
      listPriceUsd: listPrice,
      dangerousGoods: !!row.dg,
    });

    var effectiveFba = fe.fulfillmentFeeUsd;
    var fbaSource =
      (row.dg ? "危险品" : row.productFeeCategory === "apparel" ? "服饰" : "一般") +
      "·" +
      listPriceBandLabel(band);

    if (FBA_FUEL_SURCHARGE_RATE > 0) {
      effectiveFba = effectiveFba * (1 + FBA_FUEL_SURCHARGE_RATE);
      fbaSource += "（含3.5%燃油附加）";
    }

    if (row.peakFulfillmentSeason) {
      effectiveFba *= FULFILLMENT_PEAK_SEASON_MULTIPLIER;
      fbaSource += "（含旺季配送×" + FULFILLMENT_PEAK_SEASON_MULTIPLIER + "）";
    }

    var effectivePrice = listPrice * (1 - promo);
    var referralFee = effectivePrice * referral;
    var refundReserve = effectivePrice * refund;

    var storageCuFt = volumeCuFtFromInches(row.lengthIn, row.widthIn, row.heightIn);

    var resolvedTier = fe.resolvedTier || "large_standard";
    var storageRateUsd = Math.max(0, row.storageUsdPerCuFtPerMonth);
    var storagePeakMult = 1;
    var storagePeakNote = "";
    if (row.peakStorageSeason) {
      storagePeakMult = peakStorageRateMultiplier(resolvedTier);
      storageRateUsd *= storagePeakMult;
      var clsLabel = storageClassFromResolvedTier(resolvedTier) === "standard" ? "标准件" : "大件/超大件";
      storagePeakNote =
        "旺季仓储估算：" +
        clsLabel +
        " · 分档 " +
        (RESOLVED_TIER_LABEL[resolvedTier] || resolvedTier) +
        " · 倍率×" +
        storagePeakMult.toFixed(3) +
        "（2026 淡旺单价比×2025 配送淡旺比微调）";
    }

    var storagePerUnit = 0;
    if (row.monthlySalesUnits > 0 && row.avgMonthlyInventoryUnits >= 0) {
      storagePerUnit =
        (row.avgMonthlyInventoryUnits * Math.max(0, storageCuFt) * storageRateUsd) /
        row.monthlySalesUnits;
    }

    var fx = row.fxUsdcny > 0 ? row.fxUsdcny : 7.2;
    var cogsUsd = row.useCnyCogs ? Math.max(0, row.cogsCny) / fx : Math.max(0, row.cogsUsd);
    var landed =
      cogsUsd +
      Math.max(0, row.freightPerUnitUsd) +
      Math.max(0, row.dutyPerUnitUsd) +
      Math.max(0, row.convertPerUnitUsd);

    var adCost = effectivePrice * adRate;
    var amazonFees = referralFee + effectiveFba + Math.max(0, row.inboundPerUnitUsd) + storagePerUnit;

    var contribution =
      effectivePrice -
      refundReserve -
      amazonFees -
      landed -
      adCost -
      Math.max(0, row.otherMktPerUnitUsd) -
      Math.max(0, row.oneOffAmortizedPerUnitUsd);

    var marginPct = effectivePrice > 0 ? (contribution / effectivePrice) * 100 : 0;
    var marginNetPct =
      effectivePrice - refundReserve > 0
        ? (contribution / (effectivePrice - refundReserve)) * 100
        : 0;

    return {
      fbaEstimate: fe,
      effectiveFbaFulfillmentUsd: effectiveFba,
      fbaSourceLabel: fbaSource,
      effectivePriceUsd: effectivePrice,
      referralFeeUsd: referralFee,
      refundReserveUsd: refundReserve,
      storagePerUnitUsd: storagePerUnit,
      landedCogsUsd: landed,
      adCostUsd: adCost,
      amazonFeesUsd: amazonFees,
      contributionUsd: contribution,
      contributionOnEffectivePct: marginPct,
      contributionOnNetPct: marginNetPct,
      storageCuFtDisplay: fe.volumeCuFt,
      fxUsdcnyUsed: fx,
      storagePeakMultiplierUsed: storagePeakMult,
      storagePeakNote: storagePeakNote,
      cogsUsdUsed: cogsUsd,
    };
  }

  function defaultRow(newIdFn) {
    return {
      id: newIdFn(),
      label: "新方案",
      lengthIn: 10,
      widthIn: 8,
      heightIn: 2,
      dimUnit: "in",
      itemWeightLb: 1,
      weightUnit: "lb",
      productFeeCategory: "general",
      sizeTierMode: "auto",
      dg: false,
      peakFulfillmentSeason: false,
      listPriceUsd: 29.99,
      promoPct: 10,
      refundPct: 5,
      referralPct: 15,
      inboundPerUnitUsd: 0.35,
      avgMonthlyInventoryUnits: 500,
      monthlySalesUnits: 300,
      storageUsdPerCuFtPerMonth: 0.78,
      peakStorageSeason: false,
      useCnyCogs: true,
      cogsCny: 45,
      cogsUsd: 6,
      fxUsdcny: 7.2,
      freightPerUnitUsd: 1.2,
      dutyPerUnitUsd: 0,
      convertPerUnitUsd: 0.1,
      adPctOfEffectivePrice: 12,
      otherMktPerUnitUsd: 0.15,
      oneOffAmortizedPerUnitUsd: 0.2,
    };
  }

  var NUM_KEYS = [
    "lengthIn",
    "widthIn",
    "heightIn",
    "itemWeightLb",
    "listPriceUsd",
    "promoPct",
    "refundPct",
    "referralPct",
    "inboundPerUnitUsd",
    "avgMonthlyInventoryUnits",
    "monthlySalesUnits",
    "storageUsdPerCuFtPerMonth",
    "cogsCny",
    "cogsUsd",
    "fxUsdcny",
    "freightPerUnitUsd",
    "dutyPerUnitUsd",
    "convertPerUnitUsd",
    "adPctOfEffectivePrice",
    "otherMktPerUnitUsd",
    "oneOffAmortizedPerUnitUsd",
  ];

  function normalizeRow(raw, newIdFn, baseDefaults) {
    var d = baseDefaults || defaultRow(newIdFn);
    var o = {};
    var k;
    for (k in d) {
      if (Object.prototype.hasOwnProperty.call(d, k)) o[k] = d[k];
    }
    if (raw && typeof raw === "object") {
      for (k in raw) {
        if (Object.prototype.hasOwnProperty.call(raw, k) && k !== "id") o[k] = raw[k];
      }
    }
    o.id = raw && raw.id ? raw.id : newIdFn();
    o.dg = !!o.dg;
    o.useCnyCogs = !!o.useCnyCogs;
    o.peakStorageSeason = !!o.peakStorageSeason;
    o.peakFulfillmentSeason = !!o.peakFulfillmentSeason;
    var i;
    for (i = 0; i < NUM_KEYS.length; i++) {
      k = NUM_KEYS[i];
      o[k] = Number(o[k]);
      if (!isFinite(o[k])) o[k] = d[k];
    }
    if (o.label == null) o.label = d.label;
    if (o.productFeeCategory !== "apparel") o.productFeeCategory = "general";
    if (o.dimUnit !== "cm") o.dimUnit = "in";
    if (o.weightUnit !== "kg" && o.weightUnit !== "oz") o.weightUnit = "lb";
    var okTier = {
      auto: 1,
      small_standard: 1,
      large_standard: 1,
      small_bulky: 1,
      large_bulky: 1,
      extra_large_0_to_50: 1,
      extra_large_50_to_70: 1,
      extra_large_70_to_150: 1,
      extra_large_over_150: 1,
    };
    if (!okTier[o.sizeTierMode]) o.sizeTierMode = "auto";
    if ("lowPrice" in o) delete o.lowPrice;
    if ("fbaFeeMode" in o) delete o.fbaFeeMode;
    if ("fbaFulfillmentUsd" in o) delete o.fbaFulfillmentUsd;
    if ("useManualProductCuFt" in o) delete o.useManualProductCuFt;
    if ("productCuFt" in o) delete o.productCuFt;
    if ("useStorageOverride" in o) delete o.useStorageOverride;
    if ("storagePerUnitUsdOverride" in o) delete o.storagePerUnitUsdOverride;
    if (o.useCnyCogs) {
      var fxx = o.fxUsdcny > 0 ? o.fxUsdcny : 7.2;
      o.cogsUsd = Math.max(0, o.cogsCny) / fxx;
    }
    return o;
  }

  global.AmzProCalc = {
    AMAZON_FBA_FEE_HELP: AMAZON_FBA_FEE_HELP,
    US_FBA_DIMENSIONAL_WEIGHT_DIVISOR: US_FBA_DIMENSIONAL_WEIGHT_DIVISOR,
    RESOLVED_TIER_LABEL: RESOLVED_TIER_LABEL,
    listPriceBand: listPriceBand,
    listPriceBandLabel: listPriceBandLabel,
    computeRow: computeRow,
    defaultRow: defaultRow,
    normalizeRow: normalizeRow,
  };
})(typeof window !== "undefined" ? window : this);
