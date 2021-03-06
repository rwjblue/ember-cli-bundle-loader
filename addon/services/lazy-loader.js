import Ember from 'ember';
import bundles from 'ember-cli-bundle-loader/config/bundles';
import { getContainer } from 'ember-cli-bundle-loader/utils/get-owner';
import loadAssets from 'ember-cli-bundle-loader/utils/load-assets';

const {A, computed} = Ember;
let loadedBundles = {};

export default Ember.Service.extend({
  bundles: null,
  loadedBundles: computed(function () {
    return loadedBundles;
  }),

  init () {
    this._super(...arguments);
    this.setBundles(bundles);
  },
  setBundles (bundles) {
    loadedBundles = {};
    bundles.forEach(bundle=>loadedBundles[bundle.name] = false);
    this.set('bundles', bundles);
  },
  needsLazyLoading (routeName) {
    var bundle = this.getBundleForRouteName(routeName);
    return bundle && !this.isBundleLoaded(bundle.name);
  },
  isBundleLoaded (bundleName) {
    return loadedBundles[bundleName];
  },
  markBundleAsLoaded (bundleName) {
    loadedBundles[bundleName] = true;
  },
  getBundleForRouteName (routeName) {
    return A(this.get('bundles')).find(bundle=>
      A(bundle.routeNames||[]).find(pattern=>
        routeName.match(pattern) && !A(bundle.blacklistedRouteNames||[]).find(blacklist=>
          routeName.match(blacklist))));
  },
  getBundleByName (bundleName) {
    return A(this.get('bundles')).find(bundle=> bundle.name === bundleName);
  },
  loadBundleForUrl (url) {
    return this.loadBundleForRouteName(this._getRouteNameFromUrl(url));
  },
  loadBundleForRouteName (routeName) {
    return this.loadBundle(this.getBundleForRouteName(routeName));
  },
  loadBundle (bundleOrBundleName) {
    const bundle = typeof bundleOrBundleName === 'string' ? this.getBundleByName(bundleOrBundleName) : bundleOrBundleName;
    if (!bundleOrBundleName) {
      return Ember.RSVP.resolve();
    }
    if (this.isBundleLoaded(bundle.name)) {
      return Ember.RSVP.resolve();
    }

    return Ember.RSVP.all(this.getDependentBundlesForBundle(bundle).map((bundle) => {
      return loadAssets(bundle.urls).then(()=>this.markBundleAsLoaded(bundle.name));
    }));
  },

  getDependentBundlesForBundle(rootBundle) {
    var self = this;

    var dependentBundles = [];
    //  seenBundleNames is a map of bundle name -> bundle -- need O(1) collection management.
    var seenBundleNames = {};
    seenBundleNames[rootBundle.name] = true;

    function _addDependents(dependentBundleNames) {
      dependentBundleNames.forEach(function(dependencyName) {
        if (seenBundleNames[dependencyName]) {
          return;
        }
        var dependencyBundle = self.getBundleByName(dependencyName);
        seenBundleNames[dependencyBundle.name] = true;
        // Adds its dependents before we add this module
        _addDependents(dependencyBundle.dependsOn || []);
        dependentBundles.push(dependencyBundle);
      });
    }
    _addDependents(rootBundle.dependsOn || []);
    // Added at the end, since this is the last bundle we should load
    dependentBundles.push(rootBundle);

    return dependentBundles;
  },

  _getRouteNameFromUrl (url) {
    const router = getContainer(this).lookup('router:main');
    const routes = router.router.recognizer.recognize(url);
    if (routes && routes.length) {
      return routes[routes.length-1].handler;
    }
  }
});
