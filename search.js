searchTool = {
	init: function() {
		$('.search-form').each(function(idx, el) {
			//TODO: 1 instance...
			new searchTool.SearchBox({el: el})
		})
	}
}

searchTool.QueryTerm = Backbone.Model.extend({
	defaults: function() {
		var defaultField = "text";
		
		return _.extend({field : defaultField},
				this.typeDefaults[this.termTypes[defaultField]]);
	},
	
	initialize: function() {
		//Is this the right way?
		this.on("change:field", this.recalculateType);
	},
	
	typeDefaults: {
		// Keys are quoted because boolean is a keyword (even though it's unused)
		"text": {
			type: "text",
			value: "",
			isInverted: false,
			requireAll: true,
			isPhrase: false
		},
		"boolean": {
			type: "boolean",
			value: false
		},
		"date": {
			type: "date",
			from: new Date(),
			to: new Date()
		}
	},
	
	termTypes: {
		text: 'text',
		title: 'text',
		selftext: 'text',
		timestamp: 'date',
		is_self: 'boolean',
		author: 'text',
		subreddit: 'text',
		over18: 'boolean',
		site: 'text',
		url: 'text',
		flair_text: 'text',
		flair_css_class: 'text'
	},
	
	recalculateType: function() {
		var oldType = this.get("type");
		var field = this.get("field");
		var newType = this.termTypes[field];
		
		if (newType !== oldType) {
			this.set(this.typeDefaults[newType]);
		}
	},
	
	canUseLucene: function() {
		var type = this.get("type");
		
		if (type === "boolean") {
			return true;
		} else if (type === "text") {
			return !this.get("isPhrase");
		} else if (type === "date") {
			return false;
		}
	},
	
	getLuceneQuery: function() {
		var type = this.get("type");
		
		if (type === "boolean") {
			return this.get("field") + ":" + this.get("value");
		} else if (type === "text") {
			if (this.get("isPhrase")) {
				return;
			}
			var result = this.get("value").trim();
			var words = result.split(" ")
			if (!this.get("requireAll")) {
				result = words.join(" OR ");
			}
			
			if (words.length > 1) {
				result = this.get("field") + ":(" + result + ")"
			} else {
				result = this.get("field") + ":" + result;
			}
			
			if (this.get("isInverted")) {
				return "NOT " + result;
			} else {
				return result;
			}
		} else if (type === "date") {
			return "";
		}
	},
	
	getCloudsearchQuery: function() {
		var type = this.get("type");
		
		if (type === "boolean") {
			return this.get("field") + ":" + (this.get("value") ? 1 : 0);
		} else if (type === "text") {
			var result;
			if (this.get("isPhrase")) {
				//Note: Single quote followed by double quote means phrase query
				result = "(field " + this.get("field") + " '\"" + this.get("value").trim() + "\"')";
			} else {
				var words = this.get("value").trim().split(" ");
				// Not sure of the best way of doing this; right now I'll modify the array in-place
				for (var i = 0; i < words.length; i++) {
					words[i] = "(field " + this.get("field") + " '" + words[i] + "')"
				}
				result = words.join(" ");
			}
			
			if (this.get("requireAll")) { // TODO: Check if there are multiple.
				result = "(and " + result + ")";
			} else {
				result = "(or " + result + ")";
			}
			if (this.get("isInverted")) {
				result = "(not " + result + ")";
			}
			return result;
		} else if (type === "date") {
			//TODO: Timezone stuff with cloudsearch - pretty sure it's not UTC.
			
			var fromTimestamp = this.get("from").getTime();
			var toTimestamp = this.get("to").getTime();
			
			//Milliseconds to seconds - probably not the best way.
			fromTimestamp = Math.round(fromTimestamp / 1000);
			toTimestamp = Math.round(toTimestamp / 1000);
			
			return this.get("field") + ":" + fromTimestamp + ".." + toTimestamp;
		}
	}
});

searchTool.SearchQuery = Backbone.Collection.extend({
	model: searchTool.QueryTerm,
	
	canUseLucene: function() {
		return this.all(function(item) { return item.canUseLucene() } );
	},
	
	getQuery: function(useLucene) {
		if (useLucene) {
			var terms = this.map(function(item) {
				console.log(item);
				console.log(item instanceof searchTool.QueryTerm);
				return item.getLuceneQuery();
			});
			
			return terms.join(" ");
		} else {
			var terms = this.map(function(item) {
				return item.getCloudsearchQuery();
			});
			
			if (terms.length > 1) {
				return "(and " + terms.join(" ") + ")";
			} else {
				return terms.join(" "); //Is this clear?
			}
		}
	}
	//TODO
});

searchTool.QueryTermView = Backbone.View.extend({
	tagName: "li",
	
	template: _.template("<select class=\"field-dropdown\">" +
					"<option value=\"text\">Title and text</option>" +
					"<option value=\"title\">Title</option>" +
					"<option value=\"selftext\">Self text</option>" +
					"<option value=\"timestamp\">Submission time</option>" +
					"<option value=\"is_self\">Post type (link, self post)</option>" + //Maybe use type_id?
					"<option value=\"author\">Author</option>" +
					"<option value=\"subreddit\">Subreddit</option>" +
					"<option value=\"over18\">NSFW</option>" +
					"<option value=\"site\">Domain</option>" +
					"<option value=\"url\">URL</option>" +
					"<option value=\"flair_text\">Flair text</option>" +
					"<option value=\"flair_css_class\">Flair CSS class</option>" + //Does this need to be there?
					// Should we include num_comments?  It's not intended for public use...
					"</select>" +
					"</div><div class=\"term-data\"></div>"),
	booleanHTML: _.template("<label><input type=\"checkbox\" class=\"boolean-toggle\" <%- checked %>>Value</label>"),
	textHTML: _.template("<select class=\"selectivity\" value=\"<%- selectivity %>\"><option value=\"all\">All of these words</option><option value=\"any\">Any of these words</option><option value=\"phrase\">All of these words in this order</option><option value=\"none\">None of these words</option></select><input class=\"text\" type=\"text\" value=\"<%- value %>\">"),
	datepickerHTML: _.template("<label>From <input class=\"time-from\" type=\"text\"></label><label>To <input class=\"time-to\" type=\"text\"></label>"),
	
	// Might be excessive
	events: {
		"change .field-dropdown" : "fieldDropdownChanged",
		"click .boolean-toggle" : "booleanValueChanged",
		"change .selectivity" : "selectivityChanged",
		"input .text" : "textChanged"
		//TODO: Delete button
	},
	
	initialize: function() {
		this.$el.html(this.template()); //Does this really need to be a template anymore?  I assume it will be when I18n is factored in...
		
		this.listenTo(this.model, 'change:type', this.termTypeChanged);
		
		//this.listenTo(this.model, 'change', this.render);
		this.listenTo(this.model, 'destroy', this.remove);
		
		// Should this be called?
		this.termTypeChanged();
	},
	
	fieldDropdownChanged: function(e) {
		var newField = e.target.value;
		
		this.model.set("field", newField);
	},
	
	termTypeChanged: function() {
		var newType = this.model.get("type");
		
		if (newType === "text") {
			var selectivity;
			
			if (this.model.get("isInverted")) {
				selectivity = "none";
			} else if (this.model.get("isPhrase")) {
				selectivity = "phrase";
			} else if (!this.model.get("requireAll")) {
				selectivity = "any";
			} else {
				selectivity = "all";
			}
			
			this.$(".term-data").html(this.textHTML({value: this.model.get("value"), selectivity: selectivity}));
		} else if (newType === "boolean") {
			this.$(".term-data").html(this.booleanHTML({checked: (this.model.get("value") ? "checked" : "")}));
		} else if (newType === "date") {
			//Will format wrong.
			this.$(".term-data").html(this.datepickerHTML({from: this.model.get("from"), to: this.model.get("to")}));
		}
		
		// I don't think this is needed...
		this.render();
	},
	
	booleanValueChanged: function(e) {
		this.model.set("value", e.target.checked);
	},
	selectivityChanged: function(e) {
		var value = e.target.value;
		this.model.set("isInverted", value === "none");
		this.model.set("requireAll", value !== "any");
		this.model.set("isPhrase", value === "phrase");
	},
	textChanged: function(e) {
		this.model.set("value", e.target.value);
	},
	
	render: function() {
		//I should NOT redo everything here.
		return this;
	},
});

searchTool.SearchBox = Backbone.View.extend({
	initialize: function() {
		this.input = this.$(".add-search-option");
		
		this.query = new searchTool.SearchQuery();

		this.listenTo(this.query, 'add', this.addOne);
		this.listenTo(this.query, 'reset', this.addAll);
		this.listenTo(this.query, 'change', this.render);

		this.query.add(new searchTool.QueryTerm());
		console.log(this.query);
	},
	
	//User's choice about the query syntax.
	useLucene: true,
	
	events: {
		"click .add-search-option": "addOption",
		"change .syntax-checkbox": "syntaxChanged"
	},
	
	addOption: function(e) {
		this.query.add(new searchTool.QueryTerm());
	},
	
	syntaxChanged: function(e) {
		console.log(e);
		this.useLucene = e.target.checked;
		
		this.render();
	},
	
	render: function() {
		var lucene = this.useLucene;
		
		var checkbox = this.$(".syntax-checkbox");
		
		if (!this.query.canUseLucene()) {
			checkbox.prop("disabled", true);
			checkbox.prop("checked", false);
			
			lucene = false;
		} else {
			checkbox.prop("disabled", false);
			checkbox.prop("checked", lucene);
		}
		
		this.$(".search-box").val(this.query.getQuery(lucene));
		
		return this;
	},
	
	addOne: function(term) {
		var view = new searchTool.QueryTermView({model: term});
		this.$(".search-options-list").append(view.render().el);
	},
	
	addAll: function() {
		this.query.each(this.addOne, this);
	}

});

searchTool.init();