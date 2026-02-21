// Define coin packages with INR pricing
module.exports = {
  COIN_PACKAGES: {
    "package_100": { 
      coins: 100, 
      price: 4900, // ₹49.00 in paise (49 * 100)
      currency: "INR",
      name: "100 Coins"
    },
    "package_210": { 
      coins: 210, 
      price: 9900, // ₹99.00 in paise (99 * 100)
      currency: "INR",
      name: "210 Coins",
      extraPercentage: 5
    },
    "package_330": { 
      coins: 330, 
      price: 14900, // ₹149.00 in paise (149 * 100)
      currency: "INR",
      name: "330 Coins",
      extraPercentage: 10
    },
    "package_460": { 
      coins: 460, 
      price: 19900, // ₹199.00 in paise (199 * 100)
      currency: "INR",
      name: "460 Coins - Best Value",
      bestValue: true,
      extraPercentage: 15
    }
  }
}