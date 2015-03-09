import Ember from 'ember';
import Util from 'ember-cli-pagination/util';
import LockToRange from 'ember-cli-pagination/watch/lock-to-range';
import { QueryParamsForBackend, ChangeMeta } from './mapping';
import PageMixin from '../page-mixin';

var ArrayProxyPromiseMixin = Ember.Mixin.create(Ember.PromiseProxyMixin, {
  then: function(success,failure) {
    var promise = this.get('promise');
    var me = this;

    promise.then(function() {
      success(me);
    }, failure);
  }
});

export default Ember.ArrayProxy.extend(PageMixin, Ember.Evented, ArrayProxyPromiseMixin, {
  page: 1,

  loading: false,

  paramMapping: function() {
    return {};
  }.property(''),

  init: function() {
    var initCallback = this.get('initCallback');
    if (initCallback) {
      initCallback(this);
    }

    try {
      this.get('promise');
    }
    catch (e) {
      this.set('promise', this.fetchContent());
    }
  },

  addParamMapping: function(key,mappedKey,mappingFunc) {
    var paramMapping = this.get('paramMapping') || {};
    if (mappingFunc) {
      paramMapping[key] = [mappedKey,mappingFunc];
    }
    else {
      paramMapping[key] = mappedKey;
    }
    this.set('paramMapping',paramMapping);
    this.incrementProperty('paramsForBackendCounter');
    //this.pageChanged();
  },

  addQueryParamMapping: function(key,mappedKey,mappingFunc) {
    return this.addParamMapping(key,mappedKey,mappingFunc);
  },

  addMetaResponseMapping: function(key,mappedKey,mappingFunc) {
    return this.addParamMapping(key,mappedKey,mappingFunc);
  },

  paramsForBackend: function() {
    var paramsObj = QueryParamsForBackend.create({page: this.getPage(), 
                                                  perPage: this.getPerPage(), 
                                                  paramMapping: this.get('paramMapping')});
    var ops = paramsObj.make();

    // take the otherParams hash and add the values at the same level as page/perPage
    ops = Util.mergeHashes(ops,this.get('otherParams')||{});

    return ops;
  }.property('page','perPage','paramMapping','paramsForBackendCounter'),

  rawFindFromStore: function() {
    var store = this.get('store');
    var modelName = this.get('modelName');

    var ops = this.get('paramsForBackend');
    var res = store.find(modelName, ops);

    return res;
  },

  /*
   * Replaced original fetchContent method in order to add
   * a 'loading' property in the model while the page content
   * is being requested.
   *
   * Source: https://github.com/mharris717/ember-cli-pagination/issues/64 (matheusdavidson)
   */
  fetchContent: function() {
  	this.set('loading', true);

  	var store = this.get('store');
  	var modelName = this.get('modelName');

  	var ops = this.get('paramsForBackend');
  	var res = store.find(modelName, ops);
  	this.incrementProperty('numRemoteCalls');
  	var me = this;

  	res.then(function(rows) {
  		var newMeta = {};
  		var totalPagesField = me.get('paramMapping').total_pages;

  		if (rows.meta) {
  			for (var k in rows.meta) {
  				newMeta[k] = rows.meta[k];
  			}

  			if (totalPagesField && totalPagesField === k) {
  				newMeta['total_pages'] = rows.meta[k];
  			}
  		}

  		me.set('loading', false);

  		return me.set('meta', newMeta);
  	}, function(error) {
  		me.set('loading', false);
  		Util.log('PagedRemoteArray#fetchContent error ' + error);
  	});

  	return res;
  }

  totalPagesBinding: "meta.total_pages",

  pageChanged: function() {
    this.set("promise", this.fetchContent());
  }.observes("page", "perPage"),

  lockToRange: function() {
    LockToRange.watch(this);
  },

  watchPage: function() {
    var page = this.get('page');
    var totalPages = this.get('totalPages');
    if (parseInt(totalPages) <= 0) {
      return;
    }

    this.trigger('pageChanged',page);

    if (page < 1 || page > totalPages) {
      this.trigger('invalidPage',{page: page, totalPages: totalPages, array: this});
    }
  }.observes('page','totalPages'),

  setOtherParam: function(k,v) {
    if (!this.get('otherParams')) {
      this.set('otherParams',{});
    }

    this.get('otherParams')[k] = v;
    this.incrementProperty('paramsForBackendCounter');
    Ember.run.once(this,"pageChanged");
  }
});