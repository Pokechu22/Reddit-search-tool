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
	value: false,
	
	canUseLucene: function() {
		return true;
	},
	
	getLuceneQuery: function() {
		return this.field + ":" + this.value;
	},
	
	getCloudsearchQuery: function() {
		return this.field + ":" + (this.value ? 1 : 0);
	}
});

searchTool.TextualQueryTerm = searchTool.QueryTerm.extend({
	value: "",
	isInverted: false,
	requireAll: true,
	isPhrase: false,
	
	canUseLucene: function() {
		return this.isPhrase;
	},
	
	getLuceneQuery: function() {
		if (this.isPhrase) {
			return;
		}
		var words = this.value.split(" ")
		var result = this.value;
		if (!this.requireAll) {
			result = words.join(" OR ");
		}
		
		if (words.length > 1) {
			result = this.field + ":(" + result + ")"
		} else {
			result = this.field + ":" + result;
		}
		return result;
	},
	
	getCloudsearchQuery: function() {
		var result;
		if (this.isPhrase) {
			//Note: Single quote followed by double quote means phrase query
			result = "(field " + this.field + " '\"" + this.value + "\"')";
		} else {
			var words = this.value.split(" ");
			// Not sure of the best way of doing this; right now I'll modify the array in-place
			for (var i = 0; i < words.length; i++) {
				words[i] = "(field " + this.field + " '" + this.value + "')"
			}
			result = words.join(" ");
		}
		
		if (this.requireAll) { // TODO: Check if there are multiple.
			result = "(and " + result + ")";
		} else {
			result = "(or " + result + ")";
		}
		if (this.isInverted) {
			result = "(not " + result + ")";
		}
		return result;
	}
});

searchTool.TimeQueryTerm = searchTool.QueryTerm.extend({
	field: "text", //Is this needed?
	from: new Date(),
	to: new Date(),
	
	canUseLucene: function() {
		return false;
	},
	
	getLuceneQuery: function() {
		return "NA";
	},
	
	getCloudsearchQuery: function() {
		//TODO: Timezone stuff with cloudsearch - pretty sure it's not UTC.
		
		var fromTimestamp = this.from.getTime();
		var toTimestamp = this.to.getTime();
		
		//Milliseconds to seconds - probably not the best way.
		fromTimestamp = Math.round(fromTimestamp / 1000);
		toTimestamp = Math.round(toTimestamp / 1000);
		
		return this.field + ":" + fromTimestamp + ".." + toTimestamp;
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
					"</div><div><%= inner_template %></div>"),
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
		"keypress .text" : "textChanged"
		//TODO: Delete button
	},
	
	initialize: function() {
		this.listenTo(this.model, 'change', this.render);
		this.listenTo(this.model, 'destroy', this.remove);
	},
	
	termTypeChanged: function(e) {
		var field = e.target.value;
		var oldType = this.termTypes[this.model.field];
		var newType = this.termTypes[field];
		
		if (oldType === newType) {
			// Don't need to change type
			this.model.field = field;
		} else {
			if (newType === "text") {
				this.model = new searchTool.TextualQueryTerm({field: field});
			} else if (newType === "boolean") {
				this.model = new searchTool.BooleanQueryTerm({field: field});
			} else if (newType === "date") {
				this.model = new searchTool.TimeQueryTerm({field: field});
			}
			
			// Is this needed?
			
			this.listenTo(this.model, 'change', this.render);
			this.listenTo(this.model, 'destroy', this.remove);
			
			// How about this?
			this.render();
		}
	},
	
	booleanValueChanged: function(e) {
		this.model.value = e.target.value;
	},
	selectivityChanged: function(e) {
		var value = e.target.value;
		this.model.isInverted = (value === "none");
		this.model.requireAll = (value !== "any");
		this.model.isPhrase = (value === "phrase");
	},
	textChanged: function(e) {
		this.model.value = e.target.value;
	},
	
	render: function() {
		var innerHTML = ""
		if (this.model instanceof searchTool.BooleanQueryTerm) {
			innerHTML = this.booleanHTML({checked: (this.model.value ? "checked" : "")});
		}
		if (this.model instanceof searchTool.TextualQueryTerm) {
			var selectivity;
			
			if (this.model.isInverted) {
				selectivity = "none";
			} else if (this.model.isPhrase) {
				selectivity = "phrase";
			} else if (!this.model.requireAll) {
				selectivity = "any";
			} else {
				selectivity = "all";
			}
			
			innerHTML = this.textHTML({value: this.model.value, selectivity: selectivity});
		}
		if (this.model instanceof searchTool.TimeQueryTerm) {
			//Will format wrong.
			innerHTML = this.datepickerHTML({from: this.model.from, to: this.model.to});
		}
		this.$el.html(this.template({ inner_template: innerHTML} ));
		
		if (this.model instanceof searchTool.TimeQueryTerm) {
			// Scoping - this is not good.
			var model = this.model;
			
			var from = this.$(".time-from");
			var to = this.$(".time-to");
			from.datepicker({
				changeMonth: true,
				changeYear: true,
				numberOfMonths: 3,
				dateFormat: "D, dd M yy", //RFC 2822 (http://tools.ietf.org/html/rfc2822#section-3.3) dates - uses the local time.
				onClose: function(selectedDate) {
					model.from = new Date(selectedDate);
					to.datepicker( "option", "minDate", selectedDate );
					
					// Um...
					this.render();
				}
			});
			to.datepicker({
				changeMonth: true,
				changeYear: true,
				numberOfMonths: 3,
				dateFormat: "D, dd M yy",
				onClose: function( selectedDate ) {
					model.to = new Date(selectedDate);
					from.datepicker( "option", "maxDate", selectedDate );
					
					this.render();
				}
			});
			from.datepicker("setDate", this.model.from);
			to.datepicker("setDate", this.model.to);
		}
		return this;
	},
});

searchTool.SearchBox = Backbone.View.extend({
	initialize: function() {
		this.input = this.$(".add-search-option");
		
		this.query = new searchTool.SearchQuery();

		this.listenTo(this.query, 'add', this.addOne);
		this.listenTo(this.query, 'reset', this.addAll);
		this.listenTo(this.query, 'all', this.render);

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
		this.$(".search-box").val(this.query.getQuery());
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