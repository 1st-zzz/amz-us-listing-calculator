/**
 * Pro 测算器核心：初版体积重/分档/全链路毛利 + 低价 FBA（Low Price）与危险品（DG）小号/大号标准阶梯。
 * ES5 语法，供 docs/index.html 引用。
 */
(function (global) {
  var AMAZON_FBA_FEE_HELP =
    "https://sellercentral.amazon.com/help/hub/reference/external/GABBX6GZPA8MSZGW";
  var US_FBA_DIMENSIONAL_WEIGHT_DIVISOR = 139;

  var RESOLVED_TIER_LABEL = {
    small_standard: "小号标准件",
    large_standard: "大号标准件",
    large_bulky: "大号大件",
    extra_large_50_to_70: "超大件 50–70 lb",
    extra_large_70_to_150: "超大件 70–150 lb",
    extra_large_over_150: "超大件 >150 lb",
  };

  /** 非危险品 · 低价 FBA（2026-01-15 生效；fee=$10-$50，lowPrice=<$10） */
  var LOW_PRICE_STANDARD = {
    small_standard: [
      { maxOz: 2, fee: 3.32, lowPrice: 2.43 },
      { maxOz: 4, fee: 3.42, lowPrice: 2.49 },
      { maxOz: 6, fee: 3.45, lowPrice: 2.56 },
      { maxOz: 8, fee: 3.54, lowPrice: 2.66 },
      { maxOz: 10, fee: 3.68, lowPrice: 2.77 },
      { maxOz: 12, fee: 3.78, lowPrice: 2.82 },
      { maxOz: 14, fee: 3.91, lowPrice: 2.92 },
      { maxOz: 16, fee: 3.96, lowPrice: 2.95 },
    ],
    large_standard: [
      { maxOz: 4, fee: 3.73, lowPrice: 2.91 },
      { maxOz: 8, fee: 3.95, lowPrice: 3.13 },
      { maxOz: 12, fee: 4.2, lowPrice: 3.38 },
      { maxOz: 16, fee: 4.6, lowPrice: 3.78 },
      { maxOz: 20, fee: 5.04, lowPrice: 4.22 },
      { maxOz: 24, fee: 5.42, lowPrice: 4.6 },
      { maxOz: 28, fee: 5.57, lowPrice: 4.75 },
      { maxOz: 32, fee: 5.82, lowPrice: 5.0 },
      { maxOz: 36, fee: 5.92, lowPrice: 5.1 },
      { maxOz: 40, fee: 6.1, lowPrice: 5.28 },
      { maxOz: 44, fee: 6.26, lowPrice: 5.44 },
      { maxOz: 48, fee: 6.67, lowPrice: 5.85 },
    ],
  };

  var DG_TABLES = {
    small_standard: [
      { maxOz: 2, fee: 4.29 },
      { maxOz: 4, fee: 4.36 },
      { maxOz: 6, fee: 4.37 },
      { maxOz: 8, fee: 4.43 },
      { maxOz: 10, fee: 4.55 },
      { maxOz: 12, fee: 4.61 },
      { maxOz: 14, fee: 4.72 },
      { maxOz: 16, fee: 4.78 },
    ],
    large_standard: [
      { maxOz: 4, fee: 4.55 },
      { maxOz: 8, fee: 4.76 },
      { maxOz: 12, fee: 4.99 },
      { maxOz: 16, fee: 5.19 },
      { maxOz: 20, fee: 5.64 },
      { maxOz: 24, fee: 6.02 },
      { maxOz: 28, fee: 6.17 },
      { maxOz: 32, fee: 6.31 },
      { maxOz: 36, fee: 6.38 },
      { maxOz: 40, fee: 6.56 },
      { maxOz: 44, fee: 6.72 },
      { maxOz: 48, fee: 7.13 },
    ],
  };

  var GENERAL_SMALL_STANDARD_BRACKETS = [
    { maxOz: 2, fee: 3.32 },
    { maxOz: 4, fee: 3.42 },
    { maxOz: 6, fee: 3.45 },
    { maxOz: 8, fee: 3.54 },
    { maxOz: 10, fee: 3.68 },
    { maxOz: 12, fee: 3.78 },
    { maxOz: 14, fee: 3.91 },
    { maxOz: 16, fee: 3.96 },
  ];

  var GENERAL_LARGE_STANDARD_BRACKETS = [
    { maxOz: 4, fee: 3.73 },
    { maxOz: 8, fee: 3.95 },
    { maxOz: 12, fee: 4.2 },
    { maxOz: 16, fee: 4.6 },
    { maxOz: 20, fee: 5.04 },
    { maxOz: 24, fee: 5.42 },
    { maxOz: 28, fee: 5.57 },
    { maxOz: 32, fee: 5.82 },
    { maxOz: 36, fee: 5.92 },
    { maxOz: 40, fee: 6.1 },
    { maxOz: 44, fee: 6.26 },
    { maxOz: 48, fee: 6.67 },
  ];

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

    var fitsBulkyDims =
      longest <= 59 &&
      median <= 33 &&
      shortest <= 33 &&
      lengthPlusGirth(longest, median, shortest) <= 130;

    if (fitsSmallEnvelope) return "small_standard";
    if (fitsLargeStandardDims && billableShippingLb <= 20) return "large_standard";
    if (fitsBulkyDims && billableShippingLb <= 50) return "large_bulky";
    if (billableShippingLb <= 70) return "extra_large_50_to_70";
    if (billableShippingLb <= 150) return "extra_large_70_to_150";
    return "extra_large_over_150";
  }

  function feeGeneralSmallStandard(shipOz) {
    var i;
    for (i = 0; i < GENERAL_SMALL_STANDARD_BRACKETS.length; i++) {
      if (shipOz <= GENERAL_SMALL_STANDARD_BRACKETS[i].maxOz)
        return GENERAL_SMALL_STANDARD_BRACKETS[i].fee;
    }
    return GENERAL_SMALL_STANDARD_BRACKETS[GENERAL_SMALL_STANDARD_BRACKETS.length - 1].fee;
  }

  function feeGeneralLargeStandard(shipOz) {
    var maxLargeOz = 20 * 16;
    var cappedOz = Math.min(shipOz, maxLargeOz);
    var i;
    for (i = 0; i < GENERAL_LARGE_STANDARD_BRACKETS.length; i++) {
      if (cappedOz <= GENERAL_LARGE_STANDARD_BRACKETS[i].maxOz)
        return GENERAL_LARGE_STANDARD_BRACKETS[i].fee;
    }
    var baseOz = 48;
    var baseFee = 6.97;
    var extraOz = cappedOz - baseOz;
    var steps = Math.ceil(extraOz / 4);
    return baseFee + steps * 0.08;
  }

  function feeApparelSmallStandard(shipOz) {
    if (shipOz <= 4) return 3.54;
    if (shipOz <= 12) return feeGeneralSmallStandard(shipOz);
    if (shipOz <= 16) return 4.25;
    return feeGeneralSmallStandard(shipOz);
  }

  function feeApparelLargeStandard(shipOz) {
    var general = feeGeneralLargeStandard(shipOz);
    if (shipOz > 16 && shipOz <= 24) return 6.04;
    if (shipOz > 40 && shipOz <= 48) return 6.90;
    return general;
  }

  function fulfillmentFeeForTier(tier, billableShippingLb, billableShippingOz, category) {
    switch (tier) {
      case "small_standard":
        return (category === "apparel" ? feeApparelSmallStandard : feeGeneralSmallStandard)(
          billableShippingOz
        );
      case "large_standard":
        return (category === "apparel" ? feeApparelLargeStandard : feeGeneralLargeStandard)(
          billableShippingOz
        );
      case "large_bulky":
        return 7.55 + Math.max(0, billableShippingLb - 1) * 0.38;
      case "extra_large_50_to_70":
        return 37.32 + Math.max(0, billableShippingLb - 51) * 0.75;
      case "extra_large_70_to_150":
        return 51.32 + Math.max(0, billableShippingLb - 71) * 0.75;
      case "extra_large_over_150":
        return 194.95 + Math.max(0, billableShippingLb - 151) * 0.19;
      default:
        return feeGeneralLargeStandard(billableShippingOz);
    }
  }

  function estimateUsFbaFulfillment(input) {
    var notes = [];
    var volumeCuIn = volumeCuInches(input.lengthIn, input.widthIn, input.heightIn);
    var volumeCuFt = volumeCuIn / 1728;
    var dimLb = dimensionalWeightLb(volumeCuIn);
    var itemLb = Math.max(0, input.itemWeightLb);
    var billableShippingLb = Math.max(itemLb, dimLb);
    var billableShippingOz = Math.ceil(billableShippingLb * 16 - 1e-9);

    var resolvedTier;
    var tierSource;
    if (input.tierOverride !== "auto") {
      resolvedTier = input.tierOverride;
      tierSource = "override";
      notes.push("档位为手动指定。");
    } else {
      resolvedTier = classifyTierAuto(
        input.lengthIn,
        input.widthIn,
        input.heightIn,
        billableShippingLb
      );
      tierSource = "auto";
    }

    if (input.category === "apparel") {
      notes.push("服饰部分区间为近似；与低价/DG 叠加时请以后台为准。");
    }

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
      input.category
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
      notes: notes,
    };
  }

  function lookupBracket(brackets, shipOz, useLowPrice) {
    var i;
    var row;
    for (i = 0; i < brackets.length; i++) {
      row = brackets[i];
      if (shipOz <= row.maxOz) {
        if (useLowPrice && row.lowPrice != null) return row.lowPrice;
        return row.fee;
      }
    }
    var last = brackets[brackets.length - 1];
    if (useLowPrice && last.lowPrice != null) return last.lowPrice;
    return last.fee;
  }

  function lookupDg(brackets, shipOz) {
    var i;
    for (i = 0; i < brackets.length; i++) {
      if (shipOz <= brackets[i].maxOz) return brackets[i].fee;
    }
    return brackets[brackets.length - 1].fee;
  }

  function largeStandardLowPriceOver48(shipOz) {
    var baseOz = 48;
    var baseFee = 6.15;
    var maxOz = 20 * 16;
    var capped = Math.min(shipOz, maxOz);
    var extraOz = Math.max(0, capped - baseOz);
    var steps = Math.ceil(extraOz / 4);
    return baseFee + steps * 0.08;
  }

  function getLowPriceFbaUsd(resolvedTier, shipOz) {
    if (resolvedTier !== "small_standard" && resolvedTier !== "large_standard") {
      return null;
    }
    var brackets = LOW_PRICE_STANDARD[resolvedTier];
    if (!brackets) return null;
    if (resolvedTier === "large_standard" && shipOz > 48) {
      return largeStandardLowPriceOver48(shipOz);
    }
    return lookupBracket(brackets, shipOz, true);
  }

  function getDgFbaUsd(resolvedTier, shipOz) {
    if (resolvedTier !== "small_standard" && resolvedTier !== "large_standard") {
      return null;
    }
    var b = DG_TABLES[resolvedTier];
    if (!b) return null;
    if (resolvedTier === "large_standard" && shipOz > 48) {
      var last = b[b.length - 1];
      if (shipOz <= last.maxOz) return lookupDg(b, shipOz);
      var extra = Math.max(0, Math.min(shipOz, 20 * 16) - 48);
      return 7.43 + Math.ceil(extra / 4) * 0.08;
    }
    return lookupDg(b, shipOz);
  }

  /**
   * 与低价表同行的「通用标准」阶梯费（fee 列），用于 DG+低价叠加：低价 + (DG − 该通用标准)。
   */
  function getGeneralStandardFeeForLowStack(resolvedTier, shipOz) {
    if (resolvedTier !== "small_standard" && resolvedTier !== "large_standard") {
      return null;
    }
    var brackets = LOW_PRICE_STANDARD[resolvedTier];
    if (!brackets) return null;
    if (resolvedTier === "large_standard" && shipOz > 48) {
      return feeGeneralLargeStandard(shipOz);
    }
    return lookupBracket(brackets, shipOz, false);
  }

  /**
   * 危险品小号/大号标准 + 低价：低价阶梯 +（DG 阶梯 − 同 oz 通用标准阶梯），与后台费率不完全一致时请以 SC 为准。
   */
  function getDgLowPriceStackedUsd(resolvedTier, shipOz) {
    var dgFee = getDgFbaUsd(resolvedTier, shipOz);
    var lowFee = getLowPriceFbaUsd(resolvedTier, shipOz);
    var genStd = getGeneralStandardFeeForLowStack(resolvedTier, shipOz);
    if (dgFee == null || lowFee == null || genStd == null) return null;
    return lowFee + (dgFee - genStd);
  }

  /** 低价 FBA 仅对标价 ≤ 该金额（美元）生效；标价大于此则勾选低价不改变配送费 */
  var LOW_PRICE_MAX_LIST_USD = 10;
  /** 2026-04-17 起燃油与物流附加费（叠加在履约配送费上） */
  var FBA_FUEL_SURCHARGE_RATE = 0.035;

  function toRatio(value) {
    if (!isFinite(value)) return 0;
    var v = Math.abs(value);
    if (v > 1.000001) return Math.min(v / 100, 1);
    return Math.min(v, 1);
  }

  function isSmallOrLargeStandardTier(tier) {
    return tier === "small_standard" || tier === "large_standard";
  }

  function computeRow(row) {
    var promo = toRatio(row.promoPct);
    var refund = toRatio(row.refundPct);
    var referral = toRatio(row.referralPct);
    var adRate = toRatio(row.adPctOfEffectivePrice);
    var listPrice = Math.max(0, row.listPriceUsd);
    var lowFbaApplies = row.lowPrice && listPrice <= LOW_PRICE_MAX_LIST_USD;

    var fe = estimateUsFbaFulfillment({
      lengthIn: row.lengthIn,
      widthIn: row.widthIn,
      heightIn: row.heightIn,
      itemWeightLb: row.itemWeightLb,
      category: row.productFeeCategory,
      tierOverride: row.sizeTierMode,
    });

    /** 未应用「低价列」的通用估算 FBA */
    var standardFeeNoLow = fe.fulfillmentFeeUsd;

    var effectiveFba = 0;
    var fbaSource = "";

    if (row.fbaFeeMode === "manual") {
      effectiveFba = Math.max(0, row.fbaFulfillmentUsd);
      fbaSource = "手写";
    } else if (row.dg) {
      var dgFee = getDgFbaUsd(fe.resolvedTier, fe.billableShippingOz);
      var oz = fe.billableShippingOz;
      var tier = fe.resolvedTier;
      if (lowFbaApplies && isSmallOrLargeStandardTier(tier) && dgFee != null) {
        var stackedDgLow = getDgLowPriceStackedUsd(tier, oz);
        if (stackedDgLow != null) {
          effectiveFba = Math.max(0, stackedDgLow);
          fbaSource =
            "危险品+低价叠加（标价≤$" +
            LOW_PRICE_MAX_LIST_USD +
            "；低价档+(DG−通用标准档)）";
        } else {
          effectiveFba = dgFee;
          fbaSource = "危险品·标准阶梯";
        }
      } else {
        if (dgFee != null) {
          effectiveFba = dgFee;
          fbaSource = "危险品·标准阶梯";
        } else {
          effectiveFba = standardFeeNoLow;
          fbaSource = "危险品·回退通用估算";
        }
        if (row.lowPrice && !lowFbaApplies) {
          fbaSource += "；低价已勾选但标价>$" + LOW_PRICE_MAX_LIST_USD + "，配送费不变";
        } else if (row.lowPrice && lowFbaApplies && !isSmallOrLargeStandardTier(tier)) {
          fbaSource += "；低价已勾选但本件非小号/大号标准，无法与 DG 表叠加，按上式回退";
        } else if (row.lowPrice && lowFbaApplies && dgFee == null) {
          fbaSource += "；低价已勾选但无 DG 小号/大号表，回退通用估算，未叠加低价档";
        }
      }
    } else if (row.lowPrice && !lowFbaApplies) {
      effectiveFba = standardFeeNoLow;
      fbaSource =
        "通用估算（低价已勾选但标价>$" + LOW_PRICE_MAX_LIST_USD + "，配送费不降档）";
    } else if (lowFbaApplies) {
      if (isSmallOrLargeStandardTier(fe.resolvedTier)) {
        var lp = getLowPriceFbaUsd(fe.resolvedTier, fe.billableShippingOz);
        if (lp != null) {
          effectiveFba = lp;
          fbaSource = "低价FBA（标价≤$" + LOW_PRICE_MAX_LIST_USD + "）";
        } else {
          effectiveFba = standardFeeNoLow;
          fbaSource = "低价·本档无低价表·回退通用估算";
        }
      } else {
        effectiveFba = standardFeeNoLow;
        fbaSource = "低价已勾选但非小号/大号标准件·回退通用估算";
      }
    } else {
      effectiveFba = standardFeeNoLow;
      fbaSource = "通用估算";
    }
    if (row.fbaFeeMode !== "manual" && FBA_FUEL_SURCHARGE_RATE > 0) {
      effectiveFba = effectiveFba * (1 + FBA_FUEL_SURCHARGE_RATE);
      fbaSource += "（含3.5%燃油附加）";
    }

    var effectivePrice = listPrice * (1 - promo);
    var referralFee = effectivePrice * referral;
    var refundReserve = effectivePrice * refund;

    var storageCuFt = row.useManualProductCuFt
      ? Math.max(0, row.productCuFt)
      : volumeCuFtFromInches(row.lengthIn, row.widthIn, row.heightIn);

    var storagePerUnit = 0;
    if (row.useStorageOverride && row.storagePerUnitUsdOverride >= 0) {
      storagePerUnit = row.storagePerUnitUsdOverride;
    } else if (row.monthlySalesUnits > 0 && row.avgMonthlyInventoryUnits >= 0) {
      storagePerUnit =
        (row.avgMonthlyInventoryUnits *
          Math.max(0, storageCuFt) *
          Math.max(0, row.storageUsdPerCuFtPerMonth)) /
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
      storageCuFtDisplay: row.useManualProductCuFt ? row.productCuFt : fe.volumeCuFt,
    };
  }

  function defaultRow(newIdFn) {
    return {
      id: newIdFn(),
      label: "新方案",
      lengthIn: 10,
      widthIn: 8,
      heightIn: 2,
      itemWeightLb: 1,
      productFeeCategory: "general",
      sizeTierMode: "auto",
      fbaFeeMode: "estimate",
      fbaFulfillmentUsd: 5.5,
      lowPrice: false,
      dg: false,
      listPriceUsd: 29.99,
      promoPct: 10,
      refundPct: 5,
      referralPct: 15,
      inboundPerUnitUsd: 0.35,
      useStorageOverride: false,
      storagePerUnitUsdOverride: 0,
      avgMonthlyInventoryUnits: 500,
      monthlySalesUnits: 300,
      storageUsdPerCuFtPerMonth: 0.78,
      useManualProductCuFt: false,
      productCuFt: 0.08,
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
    "fbaFulfillmentUsd",
    "listPriceUsd",
    "promoPct",
    "refundPct",
    "referralPct",
    "inboundPerUnitUsd",
    "storagePerUnitUsdOverride",
    "avgMonthlyInventoryUnits",
    "monthlySalesUnits",
    "storageUsdPerCuFtPerMonth",
    "productCuFt",
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
    o.lowPrice = !!o.lowPrice;
    o.dg = !!o.dg;
    o.useStorageOverride = !!o.useStorageOverride;
    o.useManualProductCuFt = !!o.useManualProductCuFt;
    o.useCnyCogs = !!o.useCnyCogs;
    var i;
    for (i = 0; i < NUM_KEYS.length; i++) {
      k = NUM_KEYS[i];
      o[k] = Number(o[k]);
      if (!isFinite(o[k])) o[k] = d[k];
    }
    if (o.label == null) o.label = d.label;
    if (o.productFeeCategory !== "apparel") o.productFeeCategory = "general";
    var okTier = {
      auto: 1,
      small_standard: 1,
      large_standard: 1,
      large_bulky: 1,
      extra_large_50_to_70: 1,
      extra_large_70_to_150: 1,
      extra_large_over_150: 1,
    };
    if (!okTier[o.sizeTierMode]) o.sizeTierMode = "auto";
    if (o.fbaFeeMode !== "manual") o.fbaFeeMode = "estimate";
    return o;
  }

  global.AmzProCalc = {
    AMAZON_FBA_FEE_HELP: AMAZON_FBA_FEE_HELP,
    US_FBA_DIMENSIONAL_WEIGHT_DIVISOR: US_FBA_DIMENSIONAL_WEIGHT_DIVISOR,
    RESOLVED_TIER_LABEL: RESOLVED_TIER_LABEL,
    computeRow: computeRow,
    defaultRow: defaultRow,
    normalizeRow: normalizeRow,
  };
})(typeof window !== "undefined" ? window : this);
