// Runs inside the config page, so it can't use anything from index.js. Slots 9 and 10 only
// exist in the high density layout, so they're hidden while low density is picked.
module.exports = function () {
  var clayConfig = this;

  function toggleHighDensitySlots() {
    var high = this.get() !== "low";
    ["ActiveSlots9", "ActiveSlots10"].forEach(function (key) {
      var item = clayConfig.getItemByMessageKey(key);
      if (high) {
        item.show();
      } else {
        item.hide();
      }
    });
  }

  clayConfig.on(clayConfig.EVENTS.AFTER_BUILD, function () {
    var density = clayConfig.getItemByMessageKey("Density");
    toggleHighDensitySlots.call(density);
    density.on("change", toggleHighDensitySlots);
  });
};
