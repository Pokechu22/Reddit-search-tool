var searchBox; //More wrong.

searchTool = {
	init: function() {
		$('.search-box').each(function(idx, el) {
			searchBox = new searchTool.SearchBox({el: el})
		})
	}
}

searchTool.SearchBox = Backbone.View.extend({
	events: {
		'click .add-search-option': 'addProperty',
		'click .update-button': 'refreshQuery',
		'change .syntax-checkbox': 'changeSyntax'
	},
	
	searchOptions: [], //Should I have this automatically generated?
	
	initialize: function() {
		if (this.searchOptions.length === 0) {
			this.addProperty();
		}
	},
	
	addProperty: function(ev) {
		//TODO: don't pass the searchBox like this
		var propertyPage = new searchTool.PropertyPage({searchBox: this});
		this.$(".search-options-list").append(propertyPage.render().$el);
		this.searchOptions.push(propertyPage);
	},
	
	useLucene: true,
	changeSyntax: function() {
		this.useLucene = this.$(".syntax-checkbox").is(":checked");
		this.refreshQuery();
	},
	
	refreshQuery: function() {
		var canUseLucene = true;
		this.searchOptions.forEach(function(option) {
			if (!option.canUseLucene()) {
				canUseLucene = false;
			}
		});
		
		var checkbox = this.$(".syntax-checkbox");
		
		var shouldUseLucene;
		if (!canUseLucene) {
			checkbox.prop("disabled", true);
			checkbox.prop("checked", false);
			shouldUseLucene = false;
		} else {
			checkbox.prop("disabled", false);
			shouldUseLucene = this.useLucene;
			if (this.useLucene) {
				checkbox.prop("checked", true);
			} else {
				checkbox.prop("checked", false);
			}
		}
		
		var query = "";
		if (shouldUseLucene) {
			this.searchOptions.forEach(function(option) {
				query += option.toLuceneQuery() + " ";
			});
		} else {
			query = "(and";
			this.searchOptions.forEach(function(option) {
				var result = option.toCloudsearchQuery();
				query += " ";
				query += result;
			});
			query += ")";
		}
		
		// TODO: This is wrong - I would use this.$, but the context is wrong or something
		// and it doesn't find the right one (when using the date picker).
		/*this.*/$(".search-box").val(query);
	}
})

searchTool.PropertyPage = Backbone.View.extend({
	tagName: 'li',
	className: 'add-search-term',
	
	dropDown: "<div>" +
					"<select name=\"term-type\" class=\"term-type\">" +
					"<option value=\"\">-----</option>" +
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
					"</div>" +
					"<div class=\"term-content\"></div>",
	
	field: '',
	type: '',
	
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
	
	booleanHTML: "<label for=\"1\">Yes/no: </label>" + 
			"<input type=\"checkbox\" class=\"query-value\">",
	
	textHTML: "<label for=\"text\">Query: </label>" + 
			"<select class=\"selectivity\" value=\"and\">" +
			"<option value=\"and\">All of these words</option>" +
			"<option value=\"or\">Any of these words</option>" +
			"<option value=\"phrase\">All of these words in this order</option>" +
			"</select>" +
			"<input type=\"text\" class=\"query-value\">",
	
	datepickerHTML: "<label for=\"from\">From</label>" +
				"<input type=\"text\" class=\"from\" name=\"from\">" +
				"<label for=\"to\">to</label>" +
				"<input type=\"text\" class=\"to\" name=\"to\">",
	
	events: {
		'change .term-type': 'updateTermType',
		'input .query-value': 'queryChanged',
		'change .query-value': 'queryChanged',
		'change .selectivity': 'queryChanged',
		'input .from': 'queryChanged',
		'input .to': 'queryChanged'
	},
	
	updateTermType: function(ev) {
		this.field = ev.target.value;
		this.type = this.termTypes[this.field];
		
		var queryChanged = this.queryChanged; //TODO: This is WRONG.
		
		if (this.type === "boolean") {
			this.$(".term-content").html(this.booleanHTML);
		} else if (this.type === "text") {
			this.$(".term-content").html(this.textHTML);
		} else if (this.type === "date") {
			this.$(".term-content").html(this.datepickerHTML);
			
			var from = this.$(".from");
			var to = this.$(".to");
			from.datepicker({
				defaultDate: "-1w",
				changeMonth: true,
				changeYear: true,
				numberOfMonths: 3,
				dateFormat: "D, dd M yy", //RFC 2822 (http://tools.ietf.org/html/rfc2822#section-3.3) dates - uses the local time.
				onClose: function( selectedDate ) {
					searchBox.refreshQuery();
					to.datepicker( "option", "minDate", selectedDate );
				}
			});
			to.datepicker({
				defaultDate: "+0d",
				changeMonth: true,
				changeYear: true,
				numberOfMonths: 3,
				dateFormat: "D, dd M yy",
				onClose: function( selectedDate ) {
					searchBox.refreshQuery();
					from.datepicker( "option", "maxDate", selectedDate );
				}
			});
		} else {
			this.$(".term-content").html("");
		}
		
		this.options.searchBox.refreshQuery();
	},
	
	initialize: function() {
		this.$el.html(this.dropDown);
	},
	
	queryChanged: function() {
		//TODO: This most definitely isn't the right way to store a parent view
		this.options.searchBox.refreshQuery();
	},
	
	toCloudsearchQuery: function() {
		var field = this.field;
		
		if (this.type === "boolean") {
			return field + ":" + (this.$(".query-value").is(':checked') ? '1' : '0');
		} else if (this.type === "text") {
			var selectivity = this.$(".selectivity").val();
			var query = this.$(".query-value").val();
			if (query.indexOf(" ") === -1) {
				return "(field " + field + " '" + query + "')"
			}
			if (selectivity === "and") {
				var tokens = query.split(" ");
				var result = "(and";
				tokens.forEach(function(token) {
					result += " ";
					result += "(field " + field + " '" + token + "')";
				});
				result += ")";
				return result;
			} else if (selectivity === "or") {
				var tokens = query.split(" ");
				var result = "(or";
				tokens.forEach(function(token) {
					result += " ";
					result += "(field " + field + " '" + token + "')";
				});
				result += ")";
				return result;
			} else if (selectivity === "phrase") {
				return "(field " + field + " '\"" + query + "\"')";
			}
		} else if (this.type === "date") {
			var fromTimestamp = Date.parse(this.$(".from").datepicker("getDate", false)) || 0;
			var toTimestamp = Date.parse(this.$(".to").datepicker("getDate", false)) || Date.now();
			
			return field + ":" + fromTimestamp + ".." + toTimestamp;
		}
		
		return "none";
	},
	
	toLuceneQuery: function() {
		if (this.type === "boolean") {
			return this.field + ":" + (this.$(".query-value").is(':checked') ? 'true' : 'false');
		} else if (this.type === "text") {
			return this.field + ":\"" + this.$(".query-value").val() + "\"";
		} else if (this.type === "date") {
			return "invalid";
		}
		return "none";
	},
	
	canUseLucene: function() {
		if (this.type === "date") {
			return false;
		}
		if (this.type === "text") {
			if (this.$(".query-value").val().indexOf(" ") !== -1) {
				return this.$(".selectivity").val() !== "phrase";
			}
		}
		return true;
	}
})

//TODO: Move elsewhere.
searchTool.init();