var searchBox; //More wrong.

searchTool = {
	init: function() {
		$('.search-form').each(function(idx, el) {
			searchBox = new searchTool.SearchBox({el: el})
		})
	}
}

searchTool.QueryTerm = Backbone.Model.extend({
	field: "text",
	
	//Abstract?
	canUseLucene: function() {
		return true;
	},
	
	getLuceneQuery: function() {
		return "nyi"
	},
	
	getCloudsearchQuery: function() {
		return "nyi"
	}
});

searchTool.BooleanQueryTerm = searchTool.QueryTerm.extend({
	defaults: function() {
		return {
			value: false
		}
	},
	
	canUseLucene: function() {
		return true;
	},
	
	getLuceneQuery: function() {
		return this.get("field") + ":" + this.get("value");
	},
	
	getCloudsearchQuery: function() {
		return this.get("field") + ":" + (this.get("value") ? 1 : 0);
	}
});

searchTool.TextualQueryTerm = searchTool.QueryTerm.extend({
	defaults: function() {
		return {
			value: "",
			isInverted: false,
			requireAll: true,
			isPhrase: false,
		}
	},
	
	canUseLucene: function() {
		return this.get("isPhrase");
	},
	
	getLuceneQuery: function() {
		if (this.get("isPhrase")) {
			return;
		}
		var words = this.get("value").split(" ")
		var result = this.get("value");
		if (!this.get("requireAll")) {
			result = words.join(" OR ");
		}
		
		if (words.length > 1) {
			result = this.get("field") + ":(" + result + ")"
		} else {
			result = this.get("field") + ":" + result;
		}
		return result;
	},
	
	getCloudsearchQuery: function() {
		var result;
		if (this.get("isPhrase")) {
			//Note: Single quote followed by double quote means phrase query
			result = "(field " + this.get("field") + " '\"" + this.get("value") + "\"')";
		} else {
			var words = this.get("value").split(" ");
			// Not sure of the best way of doing this; right now I'll modify the array in-place
			for (var i = 0; i < words.length; i++) {
				words[i] = "(field " + this.get("field") + " '" + this.get("value") + "')"
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
	}
});

searchTool.TimeQueryTerm = searchTool.QueryTerm.extend({
	defaults: function() {
		return {
			field: "text", //Is this needed?
			from: new Date(),
			to: new Date(),
		}
	},
	
	canUseLucene: function() {
		return false;
	},
	
	getLuceneQuery: function() {
		return "NA";
	},
	
	getCloudsearchQuery: function() {
		//TODO: Timezone stuff with cloudsearch - pretty sure it's not UTC.
		
		var fromTimestamp = this.get("from").getTime();
		var toTimestamp = this.get("to").getTime();
		
		//Milliseconds to seconds - probably not the best way.
		fromTimestamp = Math.round(fromTimestamp / 1000);
		toTimestamp = Math.round(toTimestamp / 1000);
		
		return this.get("field") + ":" + fromTimestamp + ".." + toTimestamp;
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
	
	template: _.template("<select class=\"term-type\">" +
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
	
	// Can I directly reference the constructors?
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
	
	// Might be excessive
	events: {
		"change .term-type" : "termTypeChanged",
		"click .boolean-toggle" : "booleanValueChanged",
		"change .selectivity" : "selectivityChanged",
		"input .text" : "textChanged"
		//TODO: Delete button
	},
	
	initialize: function() {
		this.$el.html(this.template()); //Does this really need to be a template anymore?  I assume it will be when I18n is factored in...
	
		this.listenTo(this.model, 'change', this.render);
		this.listenTo(this.model, 'destroy', this.remove);

		this.termTypeChanged({target:this.$(".term-type")[0]}); //TODO: this is definitely the wrong way.
	},
	
	termTypeChanged: function(e) {
		var field = e.target.value;
		
		var oldType = this.termTypes[this.model.get("field")];
		var newType = this.termTypes[field];
		
		if (oldType === newType) {
			// Don't need to change type
			this.model.set("field", field);
		} else {
			if (newType === "text") {
				this.model = new searchTool.TextualQueryTerm({field: field});
				
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
				this.model = new searchTool.BooleanQueryTerm({field: field});
				
				this.$(".term-data").html(this.booleanHTML({checked: (this.model.get("value") ? "checked" : "")}));
			} else if (newType === "date") {
				this.model = new searchTool.TimeQueryTerm({field: field});
				
				//Will format wrong.
				this.$(".term-data").html(this.datepickerHTML({from: this.model.get("from"), to: this.model.get("to")}));
			}
			
			// Is this needed?
			
			this.listenTo(this.model, 'change', this.render);
			this.listenTo(this.model, 'destroy', this.remove);
			
			// How about this?
			this.render();
		}
	},
	
	booleanValueChanged: function(e) {
		this.model.set("value", e.target.value);
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
		this.listenTo(this.query, 'changed', console.log);

		this.query.add(new searchTool.TextualQueryTerm());
		console.log(this.query);
	},
	
	events: {
		"click .add-search-option": "addOption"
	},
	addOption: function(e) {
		this.query.add(new searchTool.TextualQueryTerm());
	},
	
	render: function() {
		this.$(".search-box").val(this.query.getQuery(true));
		//TODO: Switch between syntaxes
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